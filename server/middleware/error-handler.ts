import type { ErrorRequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { config } from "../config.js";
import { ApiError } from "../lib/errors.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details ?? null,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed.",
      details: error.flatten(),
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({
      error: "Unique constraint violation.",
      details: error.meta ?? null,
    });
    return;
  }

  console.error(error);

  res.status(500).json({
    error: "Internal server error.",
    details: config.isProduction ? null : error,
  });
};
