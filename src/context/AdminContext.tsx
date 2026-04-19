import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AppUser {
  id: string;
  username: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  status: "ACTIVE" | "DISABLED";
  alertCount: number;
}

export interface Alert {
  id: string;
  recipientId: string | null;
  recipientUsername: string;
  senderId: string;
  senderEmail: string;
  title: string | null;
  message: string;
  status: "PENDING" | "DELIVERED" | "READ" | "ACKNOWLEDGED";
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
}

export type LoginResult =
  | { kind: "signed_in" }
  | { kind: "mfa_required"; challengeId: string; email: string; password: string; emailDeliveryWarning: string | null };

interface AdminContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  adminEmail: string;
  adminRole: string;
  users: AppUser[];
  alerts: Alert[];
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyMfa: (challengeId: string, code: string, email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  addUser: (username: string, password: string, displayName?: string | null) => Promise<void>;
  editUser: (id: string, input: { username?: string; password?: string; displayName?: string | null; status?: AppUser["status"] }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  sendAlert: (userIds: string | string[], message: string, title?: string | null) => Promise<void>;
  refreshAdminData: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
};

async function invokeEdgeFunction<T>(functionName: string, options?: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    method: options?.method || "GET" as const,
    body: options?.body ?? undefined,
  });

  if (error) {
    // Try to extract message from the error
    const message = typeof error === "object" && "message" in error
      ? (error as { message: string }).message
      : String(error);
    throw new Error(message);
  }

  return data as T;
}

// For edge functions that need path-based routing, we construct the full URL
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

  const refreshAdminData = useCallback(async () => {
    const [usersPayload, alertsPayload] = await Promise.all([
      invokeEdgeFunction<{ users: AppUser[] }>("admin-users"),
      invokeEdgeFunction<{ alerts: Alert[] }>("admin-alerts"),
    ]);

    setUsers(usersPayload.users);
    setAlerts(alertsPayload.alerts);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const { data: signIn, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const userId = signIn.user?.id;
    if (!userId) throw new Error("Sign-in failed.");

    const { data: mfa } = await supabase
      .from("admin_mfa_settings")
      .select("enabled")
      .eq("admin_id", userId)
      .maybeSingle();

    if (!mfa?.enabled) {
      return { kind: "signed_in" };
    }

    // MFA enabled — sign out and request a challenge via the edge function
    await supabase.auth.signOut();

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
    if (!res.ok) throw new Error(payload?.error || "Could not start verification.");
    return {
      kind: "mfa_required",
      challengeId: payload.challengeId,
      email,
      password,
      emailDeliveryWarning: payload.emailDeliveryWarning ?? null,
    };
  }, []);

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
    // Admin profile is auto-created via database trigger
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
    // Set up auth state listener BEFORE checking session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setAdminEmail(session.user.email ?? "");
        setIsLoggedIn(true);

        // Fetch admin role
        supabase
          .from("admin_profiles")
          .select("role")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => {
            setAdminRole(data?.role ?? "admin");
          });

        // Use setTimeout to avoid potential Supabase deadlock
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

    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
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
