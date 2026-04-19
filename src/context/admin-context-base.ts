import { createContext, useContext } from "react";

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

export interface AdminContextType {
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

export const AdminContext = createContext<AdminContextType | null>(null);

export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
};
