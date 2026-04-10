import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDesktopPreferredWindowSize } from "@/hooks/use-desktop-preferred-window-size";
import { supabase } from "@/integrations/supabase/client";
import { buildJsonRequestInit, getDesktopConfig, getEdgeFunctionsBaseUrl, getSupabaseAnonKey, parseApiResponse, postDesktopHostMessage } from "@/lib/api";

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
  senderEmail?: string;
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

const DESKTOP_STORAGE_KEY = "gentle-control-room.desktop.auth";

function getNotifiedAlertsStorageKey(userId: string) {
  return `gentle-control-room.desktop.notified-alerts.${userId}`;
}

function sortAlertsByNewest(alerts: DesktopAlert[]) {
  return [...alerts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

const badgeVariant: Record<DesktopAlertStatus, "outline" | "default" | "secondary"> = {
  PENDING: "outline",
  DELIVERED: "default",
  READ: "secondary",
};

const Desktop = () => {
  const edgeFunctionsBaseUrl = useMemo(() => getEdgeFunctionsBaseUrl(), []);
  const anonKey = useMemo(() => getSupabaseAnonKey(), []);
  const desktopConfig = useMemo(() => getDesktopConfig(), []);
  const pollingMs = Math.max((desktopConfig?.alertPollingSeconds ?? 15) * 1000, 5000);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"error" | "success">("success");
  const [isLoading, setIsLoading] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [alerts, setAlerts] = useState<DesktopAlert[]>([]);
  const [sessionUser, setSessionUser] = useState<DesktopSessionUser | null>(null);
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());
  const authRef = useRef<{ accessToken: string | null; refreshToken: string | null }>({
    accessToken: null,
    refreshToken: null,
  });
  const preferredWindowSizeRef = useDesktopPreferredWindowSize(Boolean(sessionUser));

  // --- Edge function request helpers ---

  function edgeFunctionHeaders(extraHeaders?: HeadersInit): Headers {
    const headers = new Headers(extraHeaders);
    headers.set("apikey", anonKey);
    headers.set("Content-Type", "application/json");
    return headers;
  }

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
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${edgeFunctionsBaseUrl}/desktop-auth`, {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify({ action: "refresh", refreshToken }),
      });

      if (!response.ok) {
        syncAuth({ accessToken: null, refreshToken: null }, null);
        return false;
      }

      const payload = await parseApiResponse<DesktopAuthResponse>(response);
      syncAuth(
        { accessToken: payload.tokens.accessToken, refreshToken: payload.tokens.refreshToken },
        payload.user,
      );
      return true;
    } catch {
      syncAuth({ accessToken: null, refreshToken: null }, null);
      return false;
    }
  };

  const desktopAlertRequest = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const headers = edgeFunctionHeaders();
    if (authRef.current.accessToken) {
      headers.set("Authorization", `Bearer ${authRef.current.accessToken}`);
    }

    const response = await fetch(`${edgeFunctionsBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401 && (await refreshDesktopSession())) {
      const retryHeaders = edgeFunctionHeaders();
      if (authRef.current.accessToken) {
        retryHeaders.set("Authorization", `Bearer ${authRef.current.accessToken}`);
      }
      const retryResponse = await fetch(`${edgeFunctionsBaseUrl}${path}`, {
        method,
        headers: retryHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return parseApiResponse<T>(retryResponse);
    }

    return parseApiResponse<T>(response);
  };

  const markAlertDelivered = async (alertId: string) => {
    return desktopAlertRequest<{ alert: DesktopAlert }>(
      "PATCH",
      `/desktop-alerts/${alertId}`,
      { status: "DELIVERED" },
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
    if (!sessionUser) return;
    localStorage.setItem(
      getNotifiedAlertsStorageKey(sessionUser.id),
      JSON.stringify(Array.from(nextSet).slice(-200)),
    );
  };

  const noteAlertNotified = (alertId: string) => {
    const knownIds = new Set(notifiedAlertIdsRef.current);
    knownIds.add(alertId);
    syncNotifiedAlertIds(knownIds);
  };

  const notifyNativeHost = (alert: DesktopAlert) => {
    // Skip only if config explicitly disables notifications
    if (desktopConfig && desktopConfig.enableNativeNotifications === false) return;
    // Skip if no bridge available
    if (!window.chrome?.webview?.postMessage) return;
    postDesktopHostMessage({
      type: "desktop.alert.received",
      payload: {
        id: alert.id,
        title: alert.title ?? "New alert",
        message: alert.message,
        senderEmail: alert.senderEmail ?? "",
        createdAt: alert.createdAt,
      },
    });
  };

  const requestHideToTray = () => {
    postDesktopHostMessage({ type: "desktop.window.hideToTray" });
  };

  const handleIncomingRealtimeAlert = (row: Record<string, unknown>) => {
    const incomingAlert: DesktopAlert = {
      id: row.id as string,
      title: (row.title as string) ?? "New Alert",
      message: row.message as string,
      status: row.status as DesktopAlertStatus,
      createdAt: row.created_at as string,
      deliveredAt: (row.delivered_at as string) ?? null,
      readAt: (row.read_at as string) ?? null,
    };

    if (!notifiedAlertIdsRef.current.has(incomingAlert.id)) {
      notifyNativeHost(incomingAlert);
      noteAlertNotified(incomingAlert.id);
    }

    const optimisticAlert: DesktopAlert =
      incomingAlert.status === "PENDING"
        ? { ...incomingAlert, status: "DELIVERED", deliveredAt: new Date().toISOString() }
        : incomingAlert;

    upsertAlert(optimisticAlert);

    void markAlertDelivered(incomingAlert.id)
      .then((payload) => upsertAlert(payload.alert))
      .catch(() => void fetchAlerts());
  };

  const fetchAlerts = async () => {
    if (!sessionUser) {
      setAlerts([]);
      return;
    }

    const payload = await desktopAlertRequest<DesktopAlertsResponse>(
      "GET",
      `/desktop-alerts?userId=${sessionUser.id}`,
    );
    const pendingAlerts = payload.alerts.filter((item) => item.status === "PENDING");

    for (const alert of pendingAlerts) {
      await markAlertDelivered(alert.id);
    }

    const latestPayload = pendingAlerts.length > 0
      ? await desktopAlertRequest<DesktopAlertsResponse>("GET", `/desktop-alerts?userId=${sessionUser.id}`)
      : payload;

    // Notify for ALL unseen alerts, not just pending ones
    const knownIds = new Set(notifiedAlertIdsRef.current);
    const unseenAlerts = latestPayload.alerts.filter(
      (alert) => !knownIds.has(alert.id),
    );
    for (const alert of unseenAlerts) {
      notifyNativeHost(alert);
      knownIds.add(alert.id);
    }
    syncNotifiedAlertIds(knownIds);

    setAlerts(sortAlertsByNewest(latestPayload.alerts));
  };

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setFeedback(null);

    try {
      const response = await fetch(`${edgeFunctionsBaseUrl}/desktop-auth`, {
        method: "POST",
        headers: edgeFunctionHeaders(),
        body: JSON.stringify({ action: "login", username, password }),
      });
      const payload = await parseApiResponse<DesktopAuthResponse>(response);

      syncAuth(
        { accessToken: payload.tokens.accessToken, refreshToken: payload.tokens.refreshToken },
        payload.user,
      );

      setFeedback("Signed in. The app will continue running in the background.");
      setFeedbackTone("success");
      setUsername("");
      setPassword("");
      await fetchAlerts();
      window.setTimeout(() => requestHideToTray(), 400);
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
        await fetch(`${edgeFunctionsBaseUrl}/desktop-auth`, {
          method: "POST",
          headers: edgeFunctionHeaders(),
          body: JSON.stringify({ action: "logout", refreshToken }),
        });
      }
    } finally {
      syncAuth({ accessToken: null, refreshToken: null }, null);
      setAlerts([]);
      setFeedback("Signed out.");
      setFeedbackTone("success");
    }
  };

  const handleMarkAsRead = async (alertId: string) => {
    try {
      const payload = await desktopAlertRequest<{ alert: DesktopAlert }>(
        "PATCH",
        `/desktop-alerts/${alertId}`,
        { status: "READ" },
      );
      upsertAlert(payload.alert);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to mark alert as read.");
      setFeedbackTone("error");
    }
  };

  // Restore session from localStorage
  useEffect(() => {
    const storedSession = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (!storedSession) return;

    try {
      const parsed = JSON.parse(storedSession) as {
        accessToken?: string;
        refreshToken?: string;
        user?: DesktopSessionUser;
      };
      syncAuth(
        { accessToken: parsed.accessToken ?? null, refreshToken: parsed.refreshToken ?? null },
        parsed.user ?? null,
      );
    } catch {
      syncAuth({ accessToken: null, refreshToken: null }, null);
    }
  }, []);

  // Load notified alert IDs
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
      notifiedAlertIdsRef.current = new Set(JSON.parse(storedIds) as string[]);
    } catch {
      notifiedAlertIdsRef.current = new Set();
    }
  }, [sessionUser]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!sessionUser) {
      setIsRealtimeConnected(false);
      return;
    }

    const channel = supabase
      .channel(`desktop-alerts-${sessionUser.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "alerts",
          filter: `recipient_id=eq.${sessionUser.id}`,
        },
        (payload) => {
          handleIncomingRealtimeAlert(payload.new as Record<string, unknown>);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "alerts",
          filter: `recipient_id=eq.${sessionUser.id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          upsertAlert({
            id: row.id as string,
            title: (row.title as string) ?? "New Alert",
            message: row.message as string,
            status: row.status as DesktopAlertStatus,
            createdAt: row.created_at as string,
            deliveredAt: (row.delivered_at as string) ?? null,
            readAt: (row.read_at as string) ?? null,
          });
        },
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      setIsRealtimeConnected(false);
    };
  }, [sessionUser]);

  // Polling fallback
  useEffect(() => {
    if (!sessionUser) return;
    void fetchAlerts();
    const timer = window.setInterval(() => void fetchAlerts(), pollingMs);
    return () => window.clearInterval(timer);
  }, [sessionUser, pollingMs]);

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center justify-center">
          <Card className="w-full max-w-xl shadow-elevated">
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary text-2xl font-bold text-primary-foreground">
                G
              </div>
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-[0.18em] text-primary">Windows Host + WebView2</p>
                <CardTitle className="text-4xl">Desktop alert client</CardTitle>
                <CardDescription className="mx-auto max-w-md text-base">
                  Sign in once and the app will stay in the background to receive alerts automatically.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <form className="grid gap-4" onSubmit={handleLogin}>
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
                <Button type="submit" className="gradient-primary text-primary-foreground" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              {feedback && (
                <p className={`text-sm ${feedbackTone === "error" ? "text-destructive" : "text-success"}`}>
                  {feedback}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background px-3 py-2">
      <div ref={preferredWindowSizeRef} className="mx-auto max-w-2xl space-y-2.5">
        <Card className="shadow-card">
          <CardContent className="flex items-center justify-between px-3 py-2">
            <Button size="sm" onClick={requestHideToTray} className="gradient-primary text-primary-foreground">
              Run In Background
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Sign out
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{sessionUser.displayName ?? sessionUser.username}</p>
              <p className="text-xs text-muted-foreground">{sessionUser.username}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="px-3 py-2.5 pb-1.5">
            <CardTitle className="text-base">Latest alerts</CardTitle>
            <CardDescription className="text-xs">
              Recent messages delivered to this device.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 pb-3 pt-0">
            {feedback && (
              <p className={`mb-2 text-xs ${feedbackTone === "error" ? "text-destructive" : "text-success"}`}>
                {feedback}
              </p>
            )}

            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No alerts have arrived yet.</p>
            ) : (
              <ScrollArea className="max-h-[280px] pr-2">
                <div className="space-y-1.5">
                  {alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="rounded-lg border bg-card/80 px-3 py-2 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <BellRing className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <p className="truncate text-sm font-medium">{alert.title ?? "Alert"}</p>
                            <Badge variant={badgeVariant[alert.status]} className="text-[0.65rem] px-1.5 py-0">{alert.status}</Badge>
                          </div>
                          <p className="text-xs leading-snug text-muted-foreground">{alert.message}</p>
                          <p className="text-[0.65rem] text-muted-foreground">
                            {new Date(alert.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {alert.status !== "READ" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => void handleMarkAsRead(alert.id)}>
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
  );
};

export default Desktop;
