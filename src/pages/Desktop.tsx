import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BellRing, RefreshCw, Shield, User } from "lucide-react";
import { buildJsonRequestInit, getApiBaseUrl, getDesktopConfig, parseApiResponse, postDesktopHostMessage } from "@/lib/api";

type DesktopAlertStatus = "PENDING" | "DELIVERED" | "READ";

interface DesktopSessionUser {
  id: string;
  username: string;
  displayName: string | null;
  status: "ACTIVE" | "DISABLED";
}

interface DesktopAlert {
  id: string;
  title: string | null;
  message: string;
  status: DesktopAlertStatus;
  senderEmail: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

interface DesktopAuthResponse {
  user: DesktopSessionUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface DesktopAlertsResponse {
  alerts: DesktopAlert[];
}

interface DesktopRealtimeAlertMessage {
  type: "alert.created";
  payload: DesktopAlert;
}

interface DesktopRealtimeReadyMessage {
  type: "connection.ready";
  payload: {
    userId: string;
  };
}

const DESKTOP_STORAGE_KEY = "gentle-control-room.desktop.auth";

function getNotifiedAlertsStorageKey(userId: string) {
  return `gentle-control-room.desktop.notified-alerts.${userId}`;
}

function getRealtimeAlertsUrl(apiBaseUrl: string, accessToken: string) {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/desktop-alerts";
  url.search = "";
  url.searchParams.set("accessToken", accessToken);
  return url.toString();
}

const badgeVariant: Record<DesktopAlertStatus, "outline" | "default" | "secondary"> = {
  PENDING: "outline",
  DELIVERED: "default",
  READ: "secondary",
};

function sortAlertsByNewest(alerts: DesktopAlert[]) {
  return [...alerts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

const Desktop = () => {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const desktopConfig = useMemo(() => getDesktopConfig(), []);
  const pollingMs = Math.max((desktopConfig?.alertPollingSeconds ?? 15) * 1000, 5000);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [alerts, setAlerts] = useState<DesktopAlert[]>([]);
  const [sessionUser, setSessionUser] = useState<DesktopSessionUser | null>(null);
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const realtimeReconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRealtimeRef = useRef(false);
  const authRef = useRef<{ accessToken: string | null; refreshToken: string | null }>({
    accessToken: null,
    refreshToken: null,
  });

  const syncAuth = (nextAuth: { accessToken: string | null; refreshToken: string | null }, nextUser: DesktopSessionUser | null) => {
    authRef.current = nextAuth;
    setSessionUser(nextUser);

    if (nextAuth.accessToken && nextAuth.refreshToken && nextUser) {
      localStorage.setItem(
        DESKTOP_STORAGE_KEY,
        JSON.stringify({
          accessToken: nextAuth.accessToken,
          refreshToken: nextAuth.refreshToken,
          user: nextUser,
        }),
      );
      return;
    }

    localStorage.removeItem(DESKTOP_STORAGE_KEY);
  };

  const refreshDesktopSession = async () => {
    const refreshToken = authRef.current.refreshToken;
    if (!refreshToken) {
      return false;
    }

    const response = await fetch(
      `${apiBaseUrl}/api/desktop/auth/refresh`,
      buildJsonRequestInit("POST", { refreshToken }),
    );

    if (!response.ok) {
      syncAuth({ accessToken: null, refreshToken: null }, null);
      return false;
    }

    const payload = await parseApiResponse<DesktopAuthResponse>(response);
    syncAuth(
      {
        accessToken: payload.tokens.accessToken,
        refreshToken: payload.tokens.refreshToken,
      },
      payload.user,
    );
    return true;
  };

  const desktopRequest = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const headers = new Headers(init?.headers);
    if (authRef.current.accessToken) {
      headers.set("Authorization", `Bearer ${authRef.current.accessToken}`);
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401 && (await refreshDesktopSession())) {
      const retryHeaders = new Headers(init?.headers);
      if (authRef.current.accessToken) {
        retryHeaders.set("Authorization", `Bearer ${authRef.current.accessToken}`);
      }

      const retryResponse = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: retryHeaders,
      });

      return parseApiResponse<T>(retryResponse);
    }

    return parseApiResponse<T>(response);
  };

  const markAlertDelivered = async (alertId: string) => {
    return desktopRequest<{ alert: DesktopAlert }>(
      `/api/desktop/alerts/${alertId}/delivered`,
      buildJsonRequestInit("POST", {}),
    );
  };

  const upsertAlert = (nextAlert: DesktopAlert) => {
    setAlerts((currentAlerts) => {
      const existingAlert = currentAlerts.find((alert) => alert.id === nextAlert.id);
      if (!existingAlert) {
        return sortAlertsByNewest([nextAlert, ...currentAlerts]);
      }

      return sortAlertsByNewest(
        currentAlerts.map((alert) => (alert.id === nextAlert.id ? { ...alert, ...nextAlert } : alert)),
      );
    });
  };

  const syncNotifiedAlertIds = (ids: Iterable<string>) => {
    const nextSet = new Set(ids);
    notifiedAlertIdsRef.current = nextSet;

    if (!sessionUser) {
      return;
    }

    localStorage.setItem(
      getNotifiedAlertsStorageKey(sessionUser.id),
      JSON.stringify(Array.from(nextSet).slice(-200)),
    );
  };

  const notifyNativeHost = (alert: DesktopAlert) => {
    if (!desktopConfig?.enableNativeNotifications) {
      return;
    }

    postDesktopHostMessage({
      type: "desktop.alert.received",
      payload: {
        id: alert.id,
        title: alert.title ?? "New alert",
        message: alert.message,
        senderEmail: alert.senderEmail,
        createdAt: alert.createdAt,
      },
    });
  };

  const noteAlertNotified = (alertId: string) => {
    const knownIds = new Set(notifiedAlertIdsRef.current);
    knownIds.add(alertId);
    syncNotifiedAlertIds(knownIds);
  };

  const handleIncomingRealtimeAlert = (incomingAlert: DesktopAlert) => {
    const alreadyNotified = notifiedAlertIdsRef.current.has(incomingAlert.id);
    if (!alreadyNotified) {
      notifyNativeHost(incomingAlert);
      noteAlertNotified(incomingAlert.id);
    }

    const optimisticAlert: DesktopAlert =
      incomingAlert.status === "PENDING"
        ? {
            ...incomingAlert,
            status: "DELIVERED",
            deliveredAt: new Date().toISOString(),
          }
        : incomingAlert;

    upsertAlert(optimisticAlert);

    void markAlertDelivered(incomingAlert.id)
      .then((payload) => {
        upsertAlert(payload.alert);
      })
      .catch(() => {
        void fetchAlerts();
      });
  };

  const fetchAlerts = async () => {
    if (!authRef.current.accessToken) {
      setAlerts([]);
      return;
    }

    const payload = await desktopRequest<DesktopAlertsResponse>("/api/desktop/alerts");
    const pendingAlerts = payload.alerts.filter((item) => item.status === "PENDING");

    for (const alert of pendingAlerts) {
      await markAlertDelivered(alert.id);
    }

    const latestPayload = pendingAlerts.length > 0
      ? await desktopRequest<DesktopAlertsResponse>("/api/desktop/alerts")
      : payload;

    if (pendingAlerts.length > 0) {
      const knownIds = new Set(notifiedAlertIdsRef.current);
      const newlyDeliveredAlerts = latestPayload.alerts.filter(
        (alert) => pendingAlerts.some((pendingAlert) => pendingAlert.id === alert.id) && !knownIds.has(alert.id),
      );

      for (const alert of newlyDeliveredAlerts) {
        notifyNativeHost(alert);
        knownIds.add(alert.id);
      }

      syncNotifiedAlertIds(knownIds);
    }

    setAlerts(sortAlertsByNewest(latestPayload.alerts));
  };

  const handleRefreshAlerts = async () => {
    setIsRefreshing(true);
    try {
      await fetchAlerts();
      setFeedback("Alerts refreshed.");
      setFeedbackTone("success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to refresh alerts.");
      setFeedbackTone("error");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/desktop/auth/login`,
        buildJsonRequestInit("POST", { username, password }),
      );
      const payload = await parseApiResponse<DesktopAuthResponse>(response);

      syncAuth(
        {
          accessToken: payload.tokens.accessToken,
          refreshToken: payload.tokens.refreshToken,
        },
        payload.user,
      );

      setFeedback("Desktop session established.");
      setFeedbackTone("success");
      setUsername("");
      setPassword("");
      await fetchAlerts();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to sign in.");
      setFeedbackTone("error");
      setAlerts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    const refreshToken = authRef.current.refreshToken;

    try {
      if (refreshToken) {
        await fetch(
          `${apiBaseUrl}/api/desktop/auth/logout`,
          buildJsonRequestInit("POST", { refreshToken }),
        );
      }
    } finally {
      shouldReconnectRealtimeRef.current = false;
      if (realtimeReconnectTimerRef.current) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
      setIsRealtimeConnected(false);
      syncAuth({ accessToken: null, refreshToken: null }, null);
      setAlerts([]);
      setFeedback("Signed out.");
      setFeedbackTone("success");
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      await desktopRequest<{ alert: DesktopAlert }>(
        `/api/desktop/alerts/${alertId}/read`,
        buildJsonRequestInit("POST", {}),
      );
      await fetchAlerts();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to mark alert as read.");
      setFeedbackTone("error");
    }
  };

  useEffect(() => {
    const storedSession = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (!storedSession) {
      return;
    }

    try {
      const parsed = JSON.parse(storedSession) as {
        accessToken?: string;
        refreshToken?: string;
        user?: DesktopSessionUser;
      };

      syncAuth(
        {
          accessToken: parsed.accessToken ?? null,
          refreshToken: parsed.refreshToken ?? null,
        },
        parsed.user ?? null,
      );
    } catch {
      syncAuth({ accessToken: null, refreshToken: null }, null);
    }
  }, []);

  useEffect(() => {
    if (!sessionUser) {
      notifiedAlertIdsRef.current = new Set();
      return;
    }

    const storedIds = localStorage.getItem(getNotifiedAlertsStorageKey(sessionUser.id));
    if (!storedIds) {
      notifiedAlertIdsRef.current = new Set();
      return;
    }

    try {
      const parsed = JSON.parse(storedIds) as string[];
      notifiedAlertIdsRef.current = new Set(parsed);
    } catch {
      notifiedAlertIdsRef.current = new Set();
    }
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser || !authRef.current.accessToken) {
      shouldReconnectRealtimeRef.current = false;
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
      setIsRealtimeConnected(false);
      return;
    }

    shouldReconnectRealtimeRef.current = true;

    const connect = () => {
      if (!shouldReconnectRealtimeRef.current || !authRef.current.accessToken) {
        return;
      }

      const socket = new WebSocket(getRealtimeAlertsUrl(apiBaseUrl, authRef.current.accessToken));
      realtimeSocketRef.current = socket;

      socket.addEventListener("open", () => {
        setIsRealtimeConnected(true);
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data) as DesktopRealtimeAlertMessage | DesktopRealtimeReadyMessage;
          if (message.type === "alert.created") {
            handleIncomingRealtimeAlert(message.payload);
          }
        } catch {
          // Ignore malformed realtime messages.
        }
      });

      socket.addEventListener("close", () => {
        if (realtimeSocketRef.current === socket) {
          realtimeSocketRef.current = null;
        }

        setIsRealtimeConnected(false);

        if (!shouldReconnectRealtimeRef.current) {
          return;
        }

        realtimeReconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, 3000);
      });

      socket.addEventListener("error", () => {
        socket.close();
      });
    };

    connect();

    return () => {
      shouldReconnectRealtimeRef.current = false;
      if (realtimeReconnectTimerRef.current) {
        window.clearTimeout(realtimeReconnectTimerRef.current);
        realtimeReconnectTimerRef.current = null;
      }
      realtimeSocketRef.current?.close();
      realtimeSocketRef.current = null;
      setIsRealtimeConnected(false);
    };
  }, [apiBaseUrl, sessionUser]);

  useEffect(() => {
    if (!sessionUser) {
      return;
    }

    void fetchAlerts();

    const timer = window.setInterval(() => {
      void fetchAlerts();
    }, pollingMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [sessionUser, pollingMs]);

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl bg-sidebar px-6 py-8 text-sidebar-foreground shadow-elevated">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary text-2xl font-bold text-primary-foreground">
              G
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-white">Gentle Control Room</h1>
              <p className="text-base text-sidebar-foreground/80">Desktop console</p>
            </div>
          </div>

          <Card className="mt-8 border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-sidebar-foreground/80">API</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold text-white">{apiBaseUrl}</p>
              <p className="text-sm text-sidebar-foreground/75">Configured in desktop host settings.</p>
            </CardContent>
          </Card>

          <Card className="mt-6 border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm uppercase tracking-[0.16em] text-sidebar-foreground/80">Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-2xl font-semibold text-white">{sessionUser ? "Signed in" : "Signed out"}</p>
              <p className="text-sm text-sidebar-foreground/75">
                {sessionUser
                  ? `${sessionUser.username} (${sessionUser.status})`
                  : "No desktop user is active"}
              </p>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-6">
          <Card className="shadow-elevated">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-primary">Windows Host + WebView2</p>
                <CardTitle className="text-4xl">Desktop login and alert delivery</CardTitle>
                <CardDescription className="max-w-3xl text-base">
                  This packaged React frontend runs inside WebView2 and talks to the backend API for desktop authentication and alerts.
                </CardDescription>
              </div>
              <div className="text-right text-muted-foreground">
                <p className="text-3xl font-semibold text-foreground">v{desktopConfig?.appVersion ?? "0.1.0"}</p>
                <p className="mt-2 text-base">
                  {isRealtimeConnected ? "Realtime connected" : `Polling every ${desktopConfig?.alertPollingSeconds ?? 15}s`}
                </p>
              </div>
            </CardHeader>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-3xl">Desktop user sign-in</CardTitle>
                <CardDescription className="mt-2 text-base">
                  Use the credentials created by the admin dashboard.
                </CardDescription>
              </div>
              <Button variant="secondary" onClick={handleLogout} disabled={!sessionUser}>
                Sign out
              </Button>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleLogin}>
                <div className="space-y-2">
                  <Label htmlFor="desktop-username">Username</Label>
                  <Input
                    id="desktop-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desktop-password">Password</Label>
                  <Input
                    id="desktop-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="h-10 self-end gradient-primary text-primary-foreground" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              {feedback && (
                <p className={`mt-4 text-base ${feedbackTone === "error" ? "text-destructive" : "text-success"}`}>
                  {feedback}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-3xl">Assigned alerts</CardTitle>
                <CardDescription className="mt-2 text-base">
                  Pending alerts are marked delivered when the desktop app receives them.
                </CardDescription>
              </div>
              <Button variant="secondary" onClick={handleRefreshAlerts} disabled={!sessionUser || isRefreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh now
              </Button>
            </CardHeader>
            <CardContent>
              {alerts.length === 0 ? (
                <p className="text-base text-muted-foreground">No alerts available for this user.</p>
              ) : (
                <ScrollArea className="max-h-[420px] pr-4">
                  <div className="space-y-4">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="rounded-2xl border bg-card/80 p-5 shadow-card">
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <BellRing className="h-4 w-4 text-primary" />
                              <h3 className="text-lg font-semibold">{alert.title ?? "Alert"}</h3>
                              <Badge variant={badgeVariant[alert.status]}>{alert.status}</Badge>
                            </div>
                            <p className="text-base text-muted-foreground">{alert.message}</p>
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span>Created {new Date(alert.createdAt).toLocaleString()}</span>
                              <span>From {alert.senderEmail}</span>
                              {alert.deliveredAt && <span>Delivered {new Date(alert.deliveredAt).toLocaleString()}</span>}
                              {alert.readAt && <span>Read {new Date(alert.readAt).toLocaleString()}</span>}
                            </div>
                          </div>
                          {alert.status !== "READ" && (
                            <Button variant="outline" onClick={() => void handleMarkAsRead(alert.id)}>
                              Mark read
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Desktop;
