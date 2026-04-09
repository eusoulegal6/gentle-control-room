import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";

import { config } from "../config.js";
import { ApiError } from "./errors.js";

export type AuthRole = "admin" | "desktop";

export interface AuthTokenPayload {
  sub: string;
  role: AuthRole;
  sessionId: string;
  email?: string;
  username?: string;
}

const PASSWORD_SALT_ROUNDS = 12;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function createRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
}

export function signAccessToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: `${config.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.sub !== "string" ||
      (decoded.role !== "admin" && decoded.role !== "desktop") ||
      typeof decoded.sessionId !== "string"
    ) {
      throw new ApiError(401, "Invalid access token.");
    }

    return {
      sub: decoded.sub,
      role: decoded.role,
      sessionId: decoded.sessionId,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      username: typeof decoded.username === "string" ? decoded.username : undefined,
    };
  } catch (error) {
    throw new ApiError(401, "Invalid or expired access token.", error);
  }
}
