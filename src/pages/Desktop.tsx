import { useEffect, useMemo, useRef, useState } from "react";
import { BellRing, RefreshCw, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildJsonRequestInit, getDesktopConfig, getEdgeFunctionsBaseUrl, getSupabaseAnonKey, parseApiResponse, postDesktopHostMessage } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [alerts, setAlerts] = useState<DesktopAlert[]>([]);
  const [sessionUser, setSessionUser] = useState<DesktopSessionUser | null>(null);
  const notifiedAlertIdsRef = useRef<Set<string>>(new Set());
  const authRef = useRef<{ accessToken: string | null; refreshToken: string | null }>({
    accessToken: null,
    refreshToken: null,
  });

  const latestAlert = alerts[0] ?? null;

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
    if (!desktopConfig?.enableNativeNotifications) return;
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

    if (pendingAlerts.length > 0) {
      const knownIds = new Set(notifiedAlertIdsRef.current);
      const newlyDeliveredAlerts = latestPayload.alerts.filter(
        (alert) => pendingAlerts.some((p) => p.id === alert.id) && !knownIds.has(alert.id),
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
      setFeedback("Alerts synced.");
      setFeedbackTone("success");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to sync alerts.");
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
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className="shadow-elevated">
          <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.18em] text-primary">Background Client</p>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight">Running and ready</h1>
                <p className="mt-2 max-w-2xl text-base text-muted-foreground">
                  The app stays in the background and shows alerts as soon as they arrive.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={isRealtimeConnected ? "default" : "outline"}>
                  {isRealtimeConnected ? "Realtime connected" : "Polling fallback"}
                </Badge>
                <Badge variant="secondary">Tray-enabled</Badge>
                <Badge variant="outline">v{desktopConfig?.appVersion ?? "0.1.0"}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={requestHideToTray} className="gradient-primary text-primary-foreground">
                Run In Background
              </Button>
              <Button variant="outline" onClick={handleRefreshAlerts} disabled={isRefreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Sync
              </Button>
              <Button variant="ghost" onClick={handleLogout}>
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-card">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-medium text-muted-foreground">Signed in as</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-lg font-semibold">{sessionUser.displayName ?? sessionUser.username}</p>
                  <p className="text-sm text-muted-foreground">{sessionUser.username}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-medium text-muted-foreground">Status</p>
              <p className="text-lg font-semibold">
                {latestAlert ? "Waiting for the next alert" : "No alerts yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {latestAlert
                  ? `Last alert at ${new Date(latestAlert.createdAt).toLocaleTimeString()}.`
                  : "Notifications will appear automatically while this app stays open or hidden in the tray."}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-medium text-muted-foreground">Background mode</p>
              <p className="text-lg font-semibold">Always on</p>
              <p className="text-sm text-muted-foreground">
                Minimize or close the window and the client will keep running in the notification area.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-2xl">Latest alerts</CardTitle>
            <CardDescription>
              A compact view of the most recent messages delivered to this device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feedback && (
              <p className={`mb-4 text-sm ${feedbackTone === "error" ? "text-destructive" : "text-success"}`}>
                {feedback}
              </p>
            )}

            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts have arrived yet.</p>
            ) : (
              <ScrollArea className="max-h-[320px] pr-3">
                <div className="space-y-3">
                  {alerts.slice(0, 5).map((alert) => (
                    <div key={alert.id} className="rounded-2xl border bg-card/80 p-4 shadow-card">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <BellRing className="h-4 w-4 text-primary" />
                            <p className="font-medium">{alert.title ?? "Alert"}</p>
                            <Badge variant={badgeVariant[alert.status]}>{alert.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(alert.createdAt).toLocaleString()}
                          </p>
                        </div>
                        {alert.status !== "READ" && (
                          <Button variant="outline" size="sm" onClick={() => void handleMarkAsRead(alert.id)}>
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
