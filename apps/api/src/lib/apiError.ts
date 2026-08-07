import type { Request, Response } from "express";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "REPOSITORY_NOT_FOUND"
  | "FORBIDDEN"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  REPOSITORY_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

export function sendError(
  req: Request,
  res: Response,
  code: ErrorCode,
  message: string
) {
  const status = STATUS_BY_CODE[code];
  return res.status(status).json({
    error: {
      code,
      message,
      requestId: (req as any).id ?? "unknown",
    },
  });
}
