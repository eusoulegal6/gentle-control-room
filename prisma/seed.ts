import "dotenv/config";

import { UserStatus } from "@prisma/client";

import { hashPassword } from "../server/lib/auth.js";
import { prisma } from "../server/prisma.js";

async function main() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const desktopUsername = (process.env.SEED_DESKTOP_USERNAME ?? "desktop.user").toLowerCase();
  const desktopPassword = process.env.SEED_DESKTOP_PASSWORD ?? "ChangeMe123!";
  const desktopDisplayName = process.env.SEED_DESKTOP_DISPLAY_NAME ?? "Desktop User";

  await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
    },
  });

  await prisma.desktopUser.upsert({
    where: { username: desktopUsername },
    update: {},
    create: {
      username: desktopUsername,
      displayName: desktopDisplayName,
      passwordHash: await hashPassword(desktopPassword),
      status: UserStatus.ACTIVE,
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
