import { AlertStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/errors.js";
import { serializeAlert } from "../lib/serializers.js";
import { prisma } from "../prisma.js";

export const desktopAlertsRouter = Router();

function getRouteId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const listAlertsQuerySchema = z.object({
  status: z.enum(["ALL", "PENDING", "DELIVERED", "READ"]).default("ALL"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

async function getOwnedAlert(alertId: string, desktopUserId: string) {
  const alert = await prisma.alert.findFirst({
    where: {
      id: alertId,
      recipientId: desktopUserId,
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

  if (!alert) {
    throw new ApiError(404, "Alert not found.");
  }

  return alert;
}

desktopAlertsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listAlertsQuerySchema.parse({
      status: typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined,
      limit: typeof req.query.limit === "string" ? req.query.limit : undefined,
    });

    const alerts = await prisma.alert.findMany({
      where: {
        recipientId: req.auth.sub,
        status: query.status === "ALL" ? undefined : (query.status as AlertStatus),
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
      take: query.limit,
    });

    res.json({
      alerts: alerts.map(serializeAlert),
    });
  }),
);

desktopAlertsRouter.post(
  "/:id/delivered",
  asyncHandler(async (req, res) => {
    const alertId = getRouteId(req.params.id);

    if (!alertId) {
      throw new ApiError(400, "Alert id is required.");
    }

    const alert = await getOwnedAlert(alertId, req.auth.sub);
    const now = new Date();

    const updatedAlert =
      alert.status === AlertStatus.PENDING || !alert.deliveredAt
        ? await prisma.alert.update({
            where: { id: alert.id },
            data: {
              status: alert.status === AlertStatus.PENDING ? AlertStatus.DELIVERED : alert.status,
              deliveredAt: alert.deliveredAt ?? now,
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
          })
        : alert;

    res.json({
      alert: serializeAlert(updatedAlert),
    });
  }),
);

desktopAlertsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const alertId = getRouteId(req.params.id);

    if (!alertId) {
      throw new ApiError(400, "Alert id is required.");
    }

    const alert = await getOwnedAlert(alertId, req.auth.sub);
    const now = new Date();

    const updatedAlert =
      alert.status !== AlertStatus.READ || !alert.readAt || !alert.deliveredAt
        ? await prisma.alert.update({
            where: { id: alert.id },
            data: {
              status: AlertStatus.READ,
              deliveredAt: alert.deliveredAt ?? now,
              readAt: alert.readAt ?? now,
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
          })
        : alert;

    res.json({
      alert: serializeAlert(updatedAlert),
    });
  }),
);
