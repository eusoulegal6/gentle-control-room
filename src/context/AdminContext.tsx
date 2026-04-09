import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { buildJsonRequestInit, getApiBaseUrl, parseApiResponse } from "@/lib/api";

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
  status: "PENDING" | "DELIVERED" | "READ";
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

interface AdminProfile {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface AdminContextType {
  isReady: boolean;
  isLoggedIn: boolean;
  adminEmail: string;
  users: AppUser[];
  alerts: Alert[];
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  addUser: (username: string, password: string, displayName?: string | null) => Promise<void>;
  editUser: (id: string, input: { username?: string; password?: string; displayName?: string | null; status?: AppUser["status"] }) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  sendAlert: (userId: string, message: string, title?: string | null) => Promise<void>;
  refreshAdminData: () => Promise<void>;
}

interface AdminAuthResponse {
  admin: AdminProfile;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

interface AdminMeResponse {
  admin: AdminProfile;
}

interface UsersResponse {
  users: AppUser[];
}

interface AlertsResponse {
  alerts: Alert[];
}

interface StoredAdminAuth {
  accessToken: string;
  refreshToken: string;
}

const ADMIN_STORAGE_KEY = "gentle-control-room.admin.auth";
const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used within AdminProvider");
  }

  return ctx;
};

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const [isReady, setIsReady] = useState(false);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const authRef = useRef<StoredAdminAuth | null>(null);

  const setAuthState = useCallback((nextAuth: StoredAdminAuth | null, nextAdmin: AdminProfile | null) => {
    authRef.current = nextAuth;
    setAdmin(nextAdmin);

    if (nextAuth) {
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(nextAuth));
      return;
    }

    localStorage.removeItem(ADMIN_STORAGE_KEY);
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshToken = authRef.current?.refreshToken;
    if (!refreshToken) {
      setAuthState(null, null);
      return false;
    }

    const response = await fetch(
      `${apiBaseUrl}/api/admin/auth/refresh`,
      buildJsonRequestInit("POST", { refreshToken }),
    );

    if (!response.ok) {
      setAuthState(null, null);
      setUsers([]);
      setAlerts([]);
      return false;
    }

    const payload = await parseApiResponse<AdminAuthResponse>(response);
    setAuthState(
      {
        accessToken: payload.tokens.accessToken,
        refreshToken: payload.tokens.refreshToken,
      },
      payload.admin,
    );
    return true;
  }, [apiBaseUrl, setAuthState]);

  const adminRequest = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const headers = new Headers(init?.headers);
      if (authRef.current?.accessToken) {
        headers.set("Authorization", `Bearer ${authRef.current.accessToken}`);
      }

      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers,
      });

      if (response.status === 401 && (await refreshSession())) {
        const retryHeaders = new Headers(init?.headers);
        if (authRef.current?.accessToken) {
          retryHeaders.set("Authorization", `Bearer ${authRef.current.accessToken}`);
        }

        const retryResponse = await fetch(`${apiBaseUrl}${path}`, {
          ...init,
          headers: retryHeaders,
        });

        return parseApiResponse<T>(retryResponse);
      }

      return parseApiResponse<T>(response);
    },
    [apiBaseUrl, refreshSession],
  );

  const refreshAdminData = useCallback(async () => {
    const [usersPayload, alertsPayload] = await Promise.all([
      adminRequest<UsersResponse>("/api/admin/users"),
      adminRequest<AlertsResponse>("/api/admin/alerts"),
    ]);

    setUsers(usersPayload.users);
    setAlerts(alertsPayload.alerts);
  }, [adminRequest]);

  const applyAuthPayload = useCallback(
    async (payload: AdminAuthResponse) => {
      setAuthState(
        {
          accessToken: payload.tokens.accessToken,
          refreshToken: payload.tokens.refreshToken,
        },
        payload.admin,
      );
      await refreshAdminData();
    },
    [refreshAdminData, setAuthState],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await fetch(
        `${apiBaseUrl}/api/admin/auth/login`,
        buildJsonRequestInit("POST", { email, password }),
      );
      const payload = await parseApiResponse<AdminAuthResponse>(response);
      await applyAuthPayload(payload);
    },
    [apiBaseUrl, applyAuthPayload],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const response = await fetch(
        `${apiBaseUrl}/api/admin/auth/register`,
        buildJsonRequestInit("POST", { email, password }),
      );
      const payload = await parseApiResponse<AdminAuthResponse>(response);
      await applyAuthPayload(payload);
    },
    [apiBaseUrl, applyAuthPayload],
  );

  const logout = useCallback(async () => {
    const refreshToken = authRef.current?.refreshToken;

    try {
      if (refreshToken) {
        await fetch(
          `${apiBaseUrl}/api/admin/auth/logout`,
          buildJsonRequestInit("POST", { refreshToken }),
        );
      }
    } finally {
      setAuthState(null, null);
      setUsers([]);
      setAlerts([]);
    }
  }, [apiBaseUrl, setAuthState]);

  const addUser = useCallback(
    async (username: string, password: string, displayName?: string | null) => {
      const payload = await adminRequest<{ user: AppUser }>(
        "/api/admin/users",
        buildJsonRequestInit("POST", {
          username,
          password,
          displayName: displayName ?? null,
        }),
      );

      setUsers((prev) => [payload.user, ...prev]);
    },
    [adminRequest],
  );

  const editUser = useCallback(
    async (id: string, input: { username?: string; password?: string; displayName?: string | null; status?: AppUser["status"] }) => {
      const payload = await adminRequest<{ user: AppUser }>(
        `/api/admin/users/${id}`,
        buildJsonRequestInit("PATCH", input),
      );

      setUsers((prev) => prev.map((user) => (user.id === id ? payload.user : user)));
    },
    [adminRequest],
  );

  const deleteUser = useCallback(
    async (id: string) => {
      await adminRequest<null>(`/api/admin/users/${id}`, {
        method: "DELETE",
      });

      setUsers((prev) => prev.filter((user) => user.id !== id));
      setAlerts((prev) => prev.filter((alert) => alert.recipientId !== id));
    },
    [adminRequest],
  );

  const sendAlert = useCallback(
    async (userId: string, message: string, title?: string | null) => {
      const payload = await adminRequest<{ alert: Alert }>(
        "/api/admin/alerts",
        buildJsonRequestInit("POST", {
          recipientId: userId,
          message,
          title: title ?? null,
        }),
      );

      setAlerts((prev) => [payload.alert, ...prev]);
    },
    [adminRequest],
  );

  useEffect(() => {
    const storedAuth = localStorage.getItem(ADMIN_STORAGE_KEY);

    if (!storedAuth) {
      setIsReady(true);
      return;
    }

    try {
      authRef.current = JSON.parse(storedAuth) as StoredAdminAuth;
    } catch {
      localStorage.removeItem(ADMIN_STORAGE_KEY);
      setIsReady(true);
      return;
    }

    const bootstrap = async () => {
      try {
        const mePayload = await adminRequest<AdminMeResponse>("/api/admin/auth/me");
        setAdmin(mePayload.admin);
        await refreshAdminData();
      } catch {
        const refreshed = await refreshSession();
        if (!refreshed) {
          setAuthState(null, null);
        } else {
          await refreshAdminData();
        }
      } finally {
        setIsReady(true);
      }
    };

    void bootstrap();
  }, [adminRequest, refreshAdminData, refreshSession, setAuthState]);

  const value = useMemo<AdminContextType>(
    () => ({
      isReady,
      isLoggedIn: Boolean(admin),
      adminEmail: admin?.email ?? "",
      users,
      alerts,
      login,
      register,
      logout,
      addUser,
      editUser,
      deleteUser,
      sendAlert,
      refreshAdminData,
    }),
    [addUser, admin, alerts, deleteUser, editUser, isReady, login, logout, refreshAdminData, register, sendAlert, users],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};
