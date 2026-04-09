import type { Admin, Alert, AlertStatus, DesktopUser, UserStatus } from "@prisma/client";

type DesktopUserWithCount = DesktopUser & {
  _count?: {
    alerts: number;
  };
};

type AlertWithRelations = Alert & {
  recipient: Pick<DesktopUser, "id" | "username" | "displayName" | "status"> | null;
};

export function serializeAdmin(admin: Admin) {
  return {
    id: admin.id,
    email: admin.email,
    createdAt: admin.createdAt.toISOString(),
    updatedAt: admin.updatedAt.toISOString(),
  };
}

export function serializeDesktopUser(user: DesktopUserWithCount) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    status: user.status as UserStatus,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    alertCount: user._count?.alerts ?? 0,
  };
}

export function serializeAlert(alert: AlertWithRelations) {
  return {
    id: alert.id,
    recipientId: alert.recipientId,
    recipientUsername: alert.recipientUsername,
    recipient: alert.recipient
      ? {
          id: alert.recipient.id,
          username: alert.recipient.username,
          displayName: alert.recipient.displayName,
          status: alert.recipient.status as UserStatus,
        }
      : null,
    senderId: alert.senderId,
    senderEmail: alert.senderEmail,
    title: alert.title,
    message: alert.message,
    status: alert.status as AlertStatus,
    createdAt: alert.createdAt.toISOString(),
    deliveredAt: alert.deliveredAt?.toISOString() ?? null,
    readAt: alert.readAt?.toISOString() ?? null,
  };
}
