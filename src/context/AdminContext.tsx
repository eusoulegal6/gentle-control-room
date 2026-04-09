import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AppUser {
  id: string;
  username: string;
  displayName: string | null;
  status: "ACTIVE" | "DISABLED";
  alertCount: number;
  createdAt: string;
  updatedAt: string;
  mustResetPassword?: boolean;
}

export interface Alert {
  id: string;
  recipientId: string | null;
  recipientUsername: string;
  title: string | null;
  message: string;
  status: "PENDING" | "DELIVERED" | "READ";
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  createdBy?: string | null;
}

interface AdminContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  adminEmail: string;
  users: AppUser[];
  alerts: Alert[];
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  addUser: (username: string, password: string, displayName?: string | null) => Promise<{ temporaryPassword?: string }>;
  editUser: (id: string, input: { username?: string; password?: string; displayName?: string | null; status?: AppUser["status"] }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  sendAlert: (userId: string, message: string, title?: string | null) => Promise<void>;
  resetUserPassword: (userId: string) => Promise<{ temporaryPassword: string; username: string }>;
  refreshAdminData: () => Promise<void>;
}

interface UsersResponse {
  users: AppUser[];
}

interface AlertsResponse {
  alerts: Alert[];
}

async function invokeFunction<T>(name: string, options?: { method?: string; body?: unknown }): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, {
    method: options?.method || 'GET',
    body: options?.body ? JSON.stringify(options.body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  });

  if (error) {
    // Try to extract error message from the response
    if (typeof error === 'object' && 'message' in error) {
      throw new Error(error.message);
    }
    throw new Error(String(error));
  }

  return data as T;
}

const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used within AdminProvider");
  }

  return ctx;
};

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const refreshAdminData = useCallback(async () => {
    try {
      const [usersPayload, alertsPayload] = await Promise.all([
        invokeFunction<UsersResponse>("admin-users"),
        invokeFunction<AlertsResponse>("admin-alerts"),
      ]);
      setUsers(usersPayload.users);
      setAlerts(alertsPayload.alerts);
    } catch (err) {
      console.error("Failed to refresh admin data:", err);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      return {};
    },
    [],
  );

  const register = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
      return {};
    },
    [],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setAdminEmail("");
    setUsers([]);
    setAlerts([]);
  }, []);

  const addUser = useCallback(
    async (username: string, password: string, displayName?: string | null): Promise<{ temporaryPassword?: string }> => {
      const payload = await invokeFunction<{ user: AppUser; temporaryPassword?: string }>("admin-users", {
        method: "POST",
        body: { username, password, displayName: displayName ?? null },
      });
      setUsers((prev) => [payload.user, ...prev]);
      return { temporaryPassword: payload.temporaryPassword };
    },
    [],
  );

  const editUser = useCallback(
    async (id: string, input: { username?: string; password?: string; displayName?: string | null; status?: AppUser["status"] }) => {
      const payload = await invokeFunction<{ user: AppUser }>(`admin-users/${id}`, {
        method: "PATCH",
        body: input,
      });
      setUsers((prev) => prev.map((user) => (user.id === id ? payload.user : user)));
    },
    [],
  );

  const deleteUser = useCallback(
    async (id: string) => {
      await invokeFunction<null>(`admin-users/${id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((user) => user.id !== id));
      setAlerts((prev) => prev.filter((alert) => alert.recipientId !== id));
    },
    [],
  );

  const sendAlert = useCallback(
    async (userId: string, message: string, title?: string | null) => {
      const payload = await invokeFunction<{ alert: Alert }>("admin-alerts", {
        method: "POST",
        body: { recipientId: userId, message, title: title ?? null },
      });
      setAlerts((prev) => [payload.alert, ...prev]);
    },
    [],
  );

  const resetUserPassword = useCallback(
    async (userId: string): Promise<{ temporaryPassword: string; username: string }> => {
      const payload = await invokeFunction<{ temporaryPassword: string; username: string }>(
        `admin-users/${userId}/reset-password`,
        { method: "POST" },
      );
      return payload;
    },
    [],
  );

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setAdminEmail(session.user.email ?? "");
        setIsLoggedIn(true);

        // Bootstrap admin profile if needed
        if (event === 'SIGNED_IN') {
          try {
            await invokeFunction("admin-bootstrap", { method: "POST" });
          } catch {
            // May fail if admin already exists - that's fine
          }
        }

        // Load data after a short delay to ensure session is propagated
        setTimeout(() => {
          void refreshAdminData();
        }, 100);
      } else {
        setIsLoggedIn(false);
        setAdminEmail("");
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
        void refreshAdminData();
      }
      setIsReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshAdminData]);

  // Subscribe to alert status changes via Realtime
  useEffect(() => {
    if (!isLoggedIn) return;

    const channel = supabase
      .channel('admin-alerts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alerts' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const a = payload.new;
            setAlerts((prev) => [{
              id: a.id,
              recipientId: a.recipient_id,
              recipientUsername: a.recipient_username,
              title: a.title,
              message: a.message,
              status: a.status,
              createdAt: a.created_at,
              deliveredAt: a.delivered_at,
              readAt: a.read_at,
              createdBy: a.created_by,
            }, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const a = payload.new;
            setAlerts((prev) => prev.map((alert) =>
              alert.id === a.id ? {
                ...alert,
                status: a.status,
                deliveredAt: a.delivered_at,
                readAt: a.read_at,
              } : alert
            ));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isLoggedIn]);

  const value = useMemo<AdminContextType>(
    () => ({
      isReady,
      isLoggedIn,
      adminEmail,
      users,
      alerts,
      login,
      register,
      logout,
      addUser,
      editUser,
      deleteUser,
      sendAlert,
      resetUserPassword,
      refreshAdminData,
    }),
    [addUser, adminEmail, alerts, deleteUser, editUser, isLoggedIn, isReady, login, logout, refreshAdminData, register, resetUserPassword, sendAlert, users],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};
