import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { UserStatus } from "@prisma/client";
import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

import { verifyAccessToken } from "./auth.js";
import { serializeAlert } from "./serializers.js";
import { prisma } from "../prisma.js";

interface AlertCreatedMessage {
  type: "alert.created";
  payload: ReturnType<typeof serializeAlert>;
}

interface ConnectionReadyMessage {
  type: "connection.ready";
  payload: {
    userId: string;
  };
}

type RealtimeMessage = AlertCreatedMessage | ConnectionReadyMessage;

function sendSocketResponse(socket: Duplex, statusCode: number, message: string) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${message.length}\r\n\r\n${message}`,
  );
  socket.destroy();
}

function sendMessage(socket: WebSocket, message: RealtimeMessage) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

class DesktopAlertsRealtimeServer {
  private readonly websocketServer: WebSocketServer;
  private readonly connections = new Map<string, Set<WebSocket>>();

  constructor(server: Server) {
    this.websocketServer = new WebSocketServer({ noServer: true });
    server.on("upgrade", (request, socket, head) => {
      void this.handleUpgrade(request, socket, head);
    });
  }

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws/desktop-alerts") {
      return;
    }

    const token = url.searchParams.get("accessToken");
    if (!token) {
      sendSocketResponse(socket, 401, "Missing access token.");
      return;
    }

    try {
      const auth = verifyAccessToken(token);
      if (auth.role !== "desktop") {
        sendSocketResponse(socket, 403, "Desktop access token required.");
        return;
      }

      const session = await prisma.desktopSession.findUnique({
        where: { id: auth.sessionId },
        include: {
          desktopUser: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (
        !session ||
        session.desktopUserId !== auth.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.desktopUser.status !== UserStatus.ACTIVE
      ) {
        sendSocketResponse(socket, 401, "Desktop session is no longer valid.");
        return;
      }

      this.websocketServer.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
        this.attachConnection(auth.sub, websocket);
      });
    } catch {
      sendSocketResponse(socket, 401, "Invalid access token.");
    }
  }

  private attachConnection(desktopUserId: string, websocket: WebSocket) {
    const connections = this.connections.get(desktopUserId) ?? new Set<WebSocket>();
    connections.add(websocket);
    this.connections.set(desktopUserId, connections);

    sendMessage(websocket, {
      type: "connection.ready",
      payload: {
        userId: desktopUserId,
      },
    });

    websocket.on("close", () => {
      this.removeConnection(desktopUserId, websocket);
    });

    websocket.on("error", () => {
      this.removeConnection(desktopUserId, websocket);
    });
  }

  private removeConnection(desktopUserId: string, websocket: WebSocket) {
    const connections = this.connections.get(desktopUserId);
    if (!connections) {
      return;
    }

    connections.delete(websocket);
    if (connections.size === 0) {
      this.connections.delete(desktopUserId);
    }
  }

  async publishAlertCreated(alertId: string) {
    const alert = await prisma.alert.findUnique({
      where: { id: alertId },
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

    if (!alert?.recipientId) {
      return;
    }

    const connections = this.connections.get(alert.recipientId);
    if (!connections || connections.size === 0) {
      return;
    }

    const payload = serializeAlert(alert);
    for (const socket of connections) {
      sendMessage(socket, {
        type: "alert.created",
        payload,
      });
    }
  }
}

let realtimeServer: DesktopAlertsRealtimeServer | null = null;

export function createDesktopAlertsRealtimeServer(server: Server) {
  realtimeServer ??= new DesktopAlertsRealtimeServer(server);
  return realtimeServer;
}

export async function publishDesktopAlertCreated(alertId: string) {
  if (!realtimeServer) {
    return;
  }

  try {
    await realtimeServer.publishAlertCreated(alertId);
  } catch (error) {
    console.error("Failed to publish realtime desktop alert.", error);
  }
}
