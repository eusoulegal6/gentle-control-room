import { UserStatus } from "@prisma/client";
import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";

import { config } from "../config.js";
import {
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashOpaqueToken,
  signAccessToken,
  verifyPassword,
} from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/errors.js";
import { serializeDesktopUser } from "../lib/serializers.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../prisma.js";

export const desktopAuthRouter = Router();

const loginSchema = z.object({
  username: z.string().min(3).max(64).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

async function createDesktopAuthSession(userId: string, username: string, req: Request) {
  const refreshToken = createRefreshToken();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const expiresAt = getRefreshTokenExpiresAt();

  const session = await prisma.desktopSession.create({
    data: {
      desktopUserId: userId,
      refreshTokenHash,
      expiresAt,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    },
  });

  return {
    tokens: {
      accessToken: signAccessToken({
        sub: userId,
        role: "desktop",
        sessionId: session.id,
        username,
      }),
      refreshToken,
      accessTokenExpiresInMinutes: config.ACCESS_TOKEN_TTL_MINUTES,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    },
  };
}

desktopAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const desktopUser = await prisma.desktopUser.findUnique({
      where: { username },
      include: {
        _count: {
          select: {
            alerts: true,
          },
        },
      },
    });

    if (!desktopUser || !(await verifyPassword(password, desktopUser.passwordHash))) {
      throw new ApiError(401, "Invalid desktop credentials.");
    }

    if (desktopUser.status !== UserStatus.ACTIVE) {
      throw new ApiError(403, "Desktop account is disabled.");
    }

    const authSession = await createDesktopAuthSession(desktopUser.id, desktopUser.username, req);

    res.json({
      user: serializeDesktopUser(desktopUser),
      tokens: authSession.tokens,
    });
  }),
);

desktopAuthRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    const session = await prisma.desktopSession.findUnique({
      where: {
        refreshTokenHash: hashOpaqueToken(refreshToken),
      },
      include: {
        desktopUser: {
          include: {
            _count: {
              select: {
                alerts: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new ApiError(401, "Invalid desktop refresh token.");
    }

    if (session.desktopUser.status !== UserStatus.ACTIVE) {
      throw new ApiError(403, "Desktop account is disabled.");
    }

    const nextRefreshToken = createRefreshToken();
    const nextExpiresAt = getRefreshTokenExpiresAt();

    await prisma.desktopSession.update({
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
      user: serializeDesktopUser(session.desktopUser),
      tokens: {
        accessToken: signAccessToken({
          sub: session.desktopUser.id,
          role: "desktop",
          sessionId: session.id,
          username: session.desktopUser.username,
        }),
        refreshToken: nextRefreshToken,
        accessTokenExpiresInMinutes: config.ACCESS_TOKEN_TTL_MINUTES,
        refreshTokenExpiresAt: nextExpiresAt.toISOString(),
      },
    });
  }),
);

desktopAuthRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);

    await prisma.desktopSession.updateMany({
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

desktopAuthRouter.get(
  "/me",
  requireAuth("desktop"),
  asyncHandler(async (req, res) => {
    const desktopUser = await prisma.desktopUser.findUnique({
      where: { id: req.auth.sub },
      include: {
        _count: {
          select: {
            alerts: true,
          },
        },
      },
    });

    if (!desktopUser) {
      throw new ApiError(404, "Desktop user not found.");
    }

    if (desktopUser.status !== UserStatus.ACTIVE) {
      throw new ApiError(403, "Desktop account is disabled.");
    }

    res.json({
      user: serializeDesktopUser(desktopUser),
    });
  }),
);
