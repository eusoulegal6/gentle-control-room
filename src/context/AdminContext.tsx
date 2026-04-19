import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminContext, useAdmin, type AdminContextType, type AppUser, type Alert, type LoginResult } from "./admin-context-base";

export { useAdmin };
export type { AppUser, Alert, LoginResult };

async function invokeEdgeFunction<T>(functionName: string, options?: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    method: options?.method || "GET" as const,
    body: options?.body ?? undefined,
  });

  if (error) {
    const message = typeof error === "object" && "message" in error
      ? (error as { message: string }).message
      : String(error);
    throw new Error(message);
  }

  return data as T;
}

async function invokeEdgeFunctionWithPath<T>(functionName: string, path: string, options?: {
  method?: string;
  body?: unknown;
}): Promise<T> {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/${functionName}/${path}`;

  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const response = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) return null as T;

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload as T;
}

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminRole, setAdminRole] = useState("admin");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const suppressAuthSideEffectsRef = useRef(false);

  const refreshAdminData = useCallback(async () => {
    const [usersPayload, alertsPayload] = await Promise.all([
      invokeEdgeFunction<{ users: AppUser[] }>("admin-users"),
      invokeEdgeFunction<{ alerts: Alert[] }>("admin-alerts"),
    ]);

    setUsers(usersPayload.users);
    setAlerts(alertsPayload.alerts);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    suppressAuthSideEffectsRef.current = true;

    try {
      const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      if (!signIn.user?.id) throw new Error("Sign-in failed.");

      const { data: mfaSettings } = await supabase
        .from("admin_mfa_settings")
        .select("enabled")
        .eq("admin_id", signIn.user.id)
        .maybeSingle();

      if (!mfaSettings?.enabled) {
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("role")
          .eq("id", signIn.user.id)
          .single();

        suppressAuthSideEffectsRef.current = false;
        setAdminEmail(signIn.user.email ?? email);
        setAdminRole(profile?.role ?? "admin");
        setIsLoggedIn(true);
        refreshAdminData().catch(console.error);
        return { kind: "signed_in" };
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-mfa/challenge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email, password }),
      });
      const payload = await res.json();

      await supabase.auth.signOut();
      suppressAuthSideEffectsRef.current = false;

      if (!res.ok) throw new Error(payload?.error || "Failed to start verification.");

      return {
        kind: "mfa_required",
        challengeId: payload.challengeId,
        email,
        password,
        emailDeliveryWarning: payload.emailDeliveryWarning ?? null,
      };
    } catch (error) {
      suppressAuthSideEffectsRef.current = false;
      throw error;
    }
  }, [refreshAdminData]);

  const verifyMfa = useCallback(async (challengeId: string, code: string, email: string, password: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-mfa/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ challengeId, code, email, password }),
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload?.error || "Verification failed.");
    const { error: setErr } = await supabase.auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    });
    if (setErr) throw new Error(setErr.message);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUsers([]);
    setAlerts([]);
  }, []);

  const addUser = useCallback(async (username: string, password: string, displayName?: string | null) => {
    const payload = await invokeEdgeFunction<{ user: AppUser }>("admin-users", {
      method: "POST",
      body: { username, password, displayName: displayName ?? null },
    });
    setUsers((prev) => [payload.user, ...prev]);
  }, []);

  const editUser = useCallback(async (id: string, input: { username?: string; password?: string; displayName?: string | null; status?: AppUser["status"] }) => {
    const payload = await invokeEdgeFunctionWithPath<{ user: AppUser }>("admin-users", id, {
      method: "PATCH",
      body: input,
    });
    setUsers((prev) => prev.map((user) => (user.id === id ? payload.user : user)));
  }, []);

  const deleteUser = useCallback(async (id: string) => {
    await invokeEdgeFunctionWithPath<null>("admin-users", id, { method: "DELETE" });
    setUsers((prev) => prev.filter((user) => user.id !== id));
    setAlerts((prev) => prev.filter((alert) => alert.recipientId !== id));
  }, []);

  const sendAlert = useCallback(async (userIds: string | string[], message: string, title?: string | null) => {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    const payload = await invokeEdgeFunction<{ alerts: Alert[] }>("admin-alerts", {
      method: "POST",
      body: { recipientIds: ids, message, title: title ?? null },
    });
    setAlerts((prev) => [...payload.alerts, ...prev]);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (suppressAuthSideEffectsRef.current) {
        setIsReady(true);
        return;
      }

      if (session?.user) {
        setAdminEmail(session.user.email ?? "");
        setIsLoggedIn(true);

        supabase
          .from("admin_profiles")
          .select("role")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            setAdminRole(data?.role ?? "admin");
          });

        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          setTimeout(() => {
            refreshAdminData().catch(console.error);
          }, 0);
        }
      } else {
        setAdminEmail("");
        setAdminRole("admin");
        setIsLoggedIn(false);
        setUsers([]);
        setAlerts([]);
      }
      setIsReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (suppressAuthSideEffectsRef.current) {
        setIsReady(true);
        return;
      }

      if (session?.user) {
        setAdminEmail(session.user.email ?? "");
        setIsLoggedIn(true);
        supabase
          .from("admin_profiles")
          .select("role")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            setAdminRole(data?.role ?? "admin");
          });
        refreshAdminData().catch(console.error);
      }
      setIsReady(true);
    });

    return () => subscription.unsubscribe();
  }, [refreshAdminData]);

  const value = useMemo<AdminContextType>(
    () => ({
      isReady,
      isLoggedIn,
      adminEmail,
      adminRole,
      users,
      alerts,
      login,
      verifyMfa,
      register,
      logout,
      addUser,
      editUser,
      deleteUser,
      sendAlert,
      refreshAdminData,
    }),
    [addUser, adminEmail, adminRole, alerts, deleteUser, editUser, isLoggedIn, isReady, login, logout, refreshAdminData, register, sendAlert, users, verifyMfa],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};
