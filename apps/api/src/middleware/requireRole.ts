import { Request, Response, NextFunction } from "express";
import { AccessTokenPayload } from "../auth/jwt.js";

export function requireRole(...allowed: AccessTokenPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "unauthenticated" });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "insufficient_role" });
    }
    next();
  };
}