import type { Request } from "express";

// Extend Express's Request type so req.rawBody is recognized everywhere
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

export function captureRawBody(req: Request, _res: unknown, buf: Buffer) {
  req.rawBody = Buffer.from(buf);
}