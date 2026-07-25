import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { logger } from "../logger";

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers["x-request-id"];
    const id = (typeof existing === "string" && existing) || randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // keep noise down: don't log health checks at info level
  customProps: (req) => ({}),
});