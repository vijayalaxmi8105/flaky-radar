import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../auth/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing_token" });
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}