CREATE TABLE IF NOT EXISTS "Admin" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_email_key" ON "Admin"("email");

CREATE TABLE IF NOT EXISTS "DesktopUser" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "username" TEXT NOT NULL,
  "displayName" TEXT,
  "passwordHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "DesktopUser_username_key" ON "DesktopUser"("username");

CREATE TABLE IF NOT EXISTS "AdminSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "adminId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminSession_refreshTokenHash_key" ON "AdminSession"("refreshTokenHash");
CREATE INDEX IF NOT EXISTS "AdminSession_adminId_idx" ON "AdminSession"("adminId");

CREATE TABLE IF NOT EXISTS "DesktopSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "desktopUserId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DesktopSession_desktopUserId_fkey" FOREIGN KEY ("desktopUserId") REFERENCES "DesktopUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DesktopSession_refreshTokenHash_key" ON "DesktopSession"("refreshTokenHash");
CREATE INDEX IF NOT EXISTS "DesktopSession_desktopUserId_idx" ON "DesktopSession"("desktopUserId");

CREATE TABLE IF NOT EXISTS "Alert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "recipientId" TEXT,
  "recipientUsername" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "title" TEXT,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" DATETIME,
  "readAt" DATETIME,
  CONSTRAINT "Alert_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "DesktopUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Alert_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Admin" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Alert_recipientId_createdAt_idx" ON "Alert"("recipientId", "createdAt");
CREATE INDEX IF NOT EXISTS "Alert_status_createdAt_idx" ON "Alert"("status", "createdAt");
