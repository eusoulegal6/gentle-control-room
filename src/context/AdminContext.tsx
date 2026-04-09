import React, { createContext, useContext, useState, useCallback } from "react";

export interface AppUser {
  id: string;
  username: string;
  password: string;
  createdAt: Date;
  status: "active" | "inactive";
}

export interface Alert {
  id: string;
  userId: string;
  username: string;
  message: string;
  sentAt: Date;
  status: "sent" | "delivered" | "read" | "failed";
}

interface AdminContextType {
  isLoggedIn: boolean;
  adminEmail: string;
  users: AppUser[];
  alerts: Alert[];
  login: (email: string, password: string) => boolean;
  register: (email: string, password: string) => boolean;
  logout: () => void;
  addUser: (username: string, password: string) => void;
  editUser: (id: string, username: string, password: string) => void;
  deleteUser: (id: string) => void;
  sendAlert: (userId: string, message: string) => void;
}

const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
};

const DEMO_USERS: AppUser[] = [
  { id: "1", username: "john.doe", password: "pass123", createdAt: new Date("2025-01-15"), status: "active" },
  { id: "2", username: "jane.smith", password: "secure456", createdAt: new Date("2025-02-20"), status: "active" },
  { id: "3", username: "mike.wilson", password: "mike789", createdAt: new Date("2025-03-10"), status: "inactive" },
];

const DEMO_ALERTS: Alert[] = [
  { id: "a1", userId: "1", username: "john.doe", message: "System maintenance scheduled for tonight at 11 PM.", sentAt: new Date("2025-04-01T10:00:00"), status: "delivered" },
  { id: "a2", userId: "2", username: "jane.smith", message: "Your account settings have been updated.", sentAt: new Date("2025-04-02T14:30:00"), status: "read" },
  { id: "a3", userId: "1", username: "john.doe", message: "New software update available. Please restart.", sentAt: new Date("2025-04-05T09:15:00"), status: "sent" },
];

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [users, setUsers] = useState<AppUser[]>(DEMO_USERS);
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS);

  const login = useCallback((email: string, _password: string) => {
    // Mock: accept any credentials for now
    setIsLoggedIn(true);
    setAdminEmail(email);
    return true;
  }, []);

  const register = useCallback((email: string, _password: string) => {
    setIsLoggedIn(true);
    setAdminEmail(email);
    return true;
  }, []);

  const logout = useCallback(() => {
    setIsLoggedIn(false);
    setAdminEmail("");
  }, []);

  const addUser = useCallback((username: string, password: string) => {
    setUsers(prev => [...prev, {
      id: crypto.randomUUID(),
      username,
      password,
      createdAt: new Date(),
      status: "active",
    }]);
  }, []);

  const editUser = useCallback((id: string, username: string, password: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, username, password } : u));
  }, []);

  const deleteUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  const sendAlert = useCallback((userId: string, message: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    setAlerts(prev => [{
      id: crypto.randomUUID(),
      userId,
      username: user.username,
      message,
      sentAt: new Date(),
      status: "sent",
    }, ...prev]);
  }, [users]);

  return (
    <AdminContext.Provider value={{ isLoggedIn, adminEmail, users, alerts, login, register, logout, addUser, editUser, deleteUser, sendAlert }}>
      {children}
    </AdminContext.Provider>
  );
};
