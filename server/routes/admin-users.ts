import { UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { hashPassword } from "../lib/auth.js";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/errors.js";
import { serializeDesktopUser } from "../lib/serializers.js";
import { prisma } from "../prisma.js";

export const adminUsersRouter = Router();

function getRouteId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const createUserSchema = z.object({
  username: z.string().min(3).max(64).transform((value) => value.trim().toLowerCase()),
  displayName: z.string().trim().max(120).optional().nullable(),
  password: z.string().min(1).max(128),
  status: z.nativeEnum(UserStatus).optional(),
});

const updateUserSchema = z
  .object({
    username: z.string().min(3).max(64).transform((value) => value.trim().toLowerCase()).optional(),
    displayName: z.string().trim().max(120).optional().nullable(),
    password: z.string().min(1).max(128).optional(),
    status: z.nativeEnum(UserStatus).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

adminUsersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.desktopUser.findMany({
      include: {
        _count: {
          select: {
            alerts: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      users: users.map(serializeDesktopUser),
    });
  }),
);

adminUsersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getRouteId(req.params.id);

    if (!userId) {
      throw new ApiError(400, "User id is required.");
    }

    const user = await prisma.desktopUser.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            alerts: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "Desktop user not found.");
    }

    res.json({
      user: serializeDesktopUser(user),
    });
  }),
);

adminUsersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { username, displayName, password, status } = createUserSchema.parse(req.body);

    const user = await prisma.desktopUser.create({
      data: {
        username,
        displayName: displayName ?? null,
        passwordHash: await hashPassword(password),
        status: status ?? UserStatus.ACTIVE,
      },
      include: {
        _count: {
          select: {
            alerts: true,
          },
        },
      },
    });

    res.status(201).json({
      user: serializeDesktopUser(user),
    });
  }),
);

adminUsersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getRouteId(req.params.id);

    if (!userId) {
      throw new ApiError(400, "User id is required.");
    }

    const payload = updateUserSchema.parse(req.body);
    const existingUser = await prisma.desktopUser.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new ApiError(404, "Desktop user not found.");
    }

    const user = await prisma.desktopUser.update({
      where: { id: existingUser.id },
      data: {
        username: payload.username,
        displayName: payload.displayName,
        status: payload.status,
        passwordHash: payload.password ? await hashPassword(payload.password) : undefined,
      },
      include: {
        _count: {
          select: {
            alerts: true,
          },
        },
      },
    });

    res.json({
      user: serializeDesktopUser(user),
    });
  }),
);

adminUsersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getRouteId(req.params.id);

    if (!userId) {
      throw new ApiError(400, "User id is required.");
    }

    const user = await prisma.desktopUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new ApiError(404, "Desktop user not found.");
    }

    await prisma.desktopUser.delete({
      where: { id: user.id },
    });

    res.status(204).send();
  }),
);
