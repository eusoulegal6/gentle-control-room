import type { NextFunction, Request, Response } from "express";

import type { AuthRole } from "../lib/auth.js";
import { verifyAccessToken } from "../lib/auth.js";
import { ApiError } from "../lib/errors.js";

export function requireAuth(role: AuthRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return next(new ApiError(401, "Missing bearer token."));
    }

    const token = header.slice("Bearer ".length).trim();
    const auth = verifyAccessToken(token);

    if (auth.role !== role) {
      return next(new ApiError(403, "Insufficient permissions for this resource."));
    }

    req.auth = auth;
    next();
  };
}
