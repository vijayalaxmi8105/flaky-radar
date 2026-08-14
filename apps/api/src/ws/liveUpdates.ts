import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createSubscriber, FLAKY_RADAR_EVENTS_CHANNEL } from "@flaky-radar/queue";
import { logger } from "../logger.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

interface LiveClient extends WebSocket {
  isAlive?: boolean;
}

export function attachLiveUpdates(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: LiveClient) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    logger.info({ clients: wss.clients.size }, "ws client connected");

    ws.on("close", () => {
      logger.info({ clients: wss.clients.size }, "ws client disconnected");
    });
  });

  // Drop dead connections (e.g. client's machine slept, network dropped
  // without a clean close frame) so wss.clients stays accurate.
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws: LiveClient) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => {
    clearInterval(heartbeat);
  });

  // Subscribe to Redis pub/sub and rebroadcast to all connected dashboard
  // clients. Dedicated subscriber connection — see pubsub.ts for why this
  // can't reuse queueConnection.
  const subscriber = createSubscriber();
  subscriber.subscribe(FLAKY_RADAR_EVENTS_CHANNEL, (err) => {
    if (err) {
      logger.error({ err }, "failed to subscribe to live updates channel");
    } else {
      logger.info({ channel: FLAKY_RADAR_EVENTS_CHANNEL }, "subscribed to live updates channel");
    }
  });

  subscriber.on("message", (_channel, message) => {
    wss.clients.forEach((ws: LiveClient) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  });

  return wss;
}