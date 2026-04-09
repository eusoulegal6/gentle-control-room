import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";

import { config } from "../config.js";
import {
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashOpaqueToken,
  hashPassword,
  signAccessToken,
  verifyPassword,
} from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/errors.js";
import { serializeAdmin } from "../lib/serializers.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../prisma.js";

export const adminAuthRouter = Router();

const registerSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const loginSchema = registerSchema;

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

async function createAdminAuthSession(adminId: string, email: string, req: Request) {
  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = getRefreshTokenExpiresAt();

  const session = await prisma.adminSession.create({
    data: {
      adminId,
      refreshTokenHash,
      expiresAt,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    },
  });

  return {
    tokens: {
      accessToken: signAccessToken({
        sub: adminId,
        role: "admin",
        sessionId: session.id,
        email,
      }),
      refreshToken,
      accessTokenExpiresInMinutes: config.ACCESS_TOKEN_TTL_MINUTES,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    },
  };
}

adminAuthRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password } = registerSchema.parse(req.body);
    const existingAdmins = await prisma.admin.count();

    if (existingAdmins > 0) {
      throw new ApiError(409, "Admin bootstrap is already complete. Use the login flow.");
    }

    const admin = await prisma.admin.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
      },
    });

    const authSession = await createAdminAuthSession(admin.id, admin.email, req);

    res.status(201).json({
      admin: serializeAdmin(admin),
      tokens: authSession.tokens,
    });
  }),
);

adminAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const admin = await prisma.admin.findUnique({
      where: { email },
    });

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      throw new ApiError(401, "Invalid admin credentials.");
    }

    const authSession = await createAdminAuthSession(admin.id, admin.email, req);

    res.json({
      admin: serializeAdmin(admin),
      tokens: authSession.tokens,
    });
  }),
);

adminAuthRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const session = await prisma.adminSession.findUnique({
      where: {
        refreshTokenHash: hashOpaqueToken(refreshToken),
      },
      include: {
        admin: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new ApiError(401, "Invalid admin refresh token.");
    }

    const nextRefreshToken = createRefreshToken();
    const nextExpiresAt = getRefreshTokenExpiresAt();

    await prisma.adminSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: hashOpaqueToken(nextRefreshToken),
        expiresAt: nextExpiresAt,
        revokedAt: null,
        userAgent: req.headers["user-agent"] ?? null,
        ipAddress: req.ip ?? null,
      },
    });

    res.json({
      admin: serializeAdmin(session.admin),
      tokens: {
        accessToken: signAccessToken({
          sub: session.admin.id,
          role: "admin",
          sessionId: session.id,
          email: session.admin.email,
        }),
        refreshToken: nextRefreshToken,
        accessTokenExpiresInMinutes: config.ACCESS_TOKEN_TTL_MINUTES,
        refreshTokenExpiresAt: nextExpiresAt.toISOString(),
      },
    });
  }),
);

adminAuthRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);

    await prisma.adminSession.updateMany({
      where: {
        refreshTokenHash: hashOpaqueToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    res.status(204).send();
  }),
);

adminAuthRouter.get(
  "/me",
  requireAuth("admin"),
  asyncHandler(async (req, res) => {
    const admin = await prisma.admin.findUnique({
      where: { id: req.auth.sub },
    });

    if (!admin) {
      throw new ApiError(404, "Admin not found.");
    }

    res.json({
      admin: serializeAdmin(admin),
    });
  }),
);
