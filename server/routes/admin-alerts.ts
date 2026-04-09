import { AlertStatus, UserStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/errors.js";
import { serializeAlert } from "../lib/serializers.js";
import { prisma } from "../prisma.js";

export const adminAlertsRouter = Router();

const createAlertSchema = z.object({
  recipientId: z.string().min(1),
  title: z.string().trim().max(120).optional().nullable(),
  message: z.string().trim().min(1).max(2000),
});

const listAlertsQuerySchema = z.object({
  recipientId: z.string().optional(),
  status: z.nativeEnum(AlertStatus).optional(),
});

adminAlertsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listAlertsQuerySchema.parse({
      recipientId: typeof req.query.recipientId === "string" ? req.query.recipientId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    });

    const alerts = await prisma.alert.findMany({
      where: {
        recipientId: query.recipientId,
        status: query.status,
      },
      include: {
        recipient: {
          select: {
            id: true,
            username: true,
            displayName: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      alerts: alerts.map(serializeAlert),
    });
  }),
);

adminAlertsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { recipientId, title, message } = createAlertSchema.parse(req.body);
    const recipient = await prisma.desktopUser.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      throw new ApiError(404, "Desktop user not found.");
    }

    if (recipient.status !== UserStatus.ACTIVE) {
      throw new ApiError(409, "Cannot send alerts to a disabled user.");
    }

    const admin = await prisma.admin.findUnique({
      where: { id: req.auth.sub },
    });

    if (!admin) {
      throw new ApiError(401, "Admin session is no longer valid.");
    }

    const alert = await prisma.alert.create({
      data: {
        recipientId: recipient.id,
        recipientUsername: recipient.username,
        senderId: admin.id,
        senderEmail: admin.email,
        title: title ?? null,
        message,
      },
      include: {
        recipient: {
          select: {
            id: true,
            username: true,
            displayName: true,
            status: true,
          },
        },
      },
    });

    res.status(201).json({
      alert: serializeAlert(alert),
    });
  }),
);
