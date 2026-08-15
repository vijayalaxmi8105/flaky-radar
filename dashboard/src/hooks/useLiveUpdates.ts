import { useEffect, useRef } from "react";

export type LiveUpdateEvent =
  | { type: "run:completed"; repositoryId: string; ciRunId: string }
  | { type: "scores:recomputed"; repositoryId?: string };

const WS_URL = "ws://localhost:3000/ws";
const RECONNECT_DELAY_MS = 3000;

/**
 * Subscribes to the backend's live-update WebSocket channel and invokes
 * onEvent for every message. Auto-reconnects on close (e.g. server
 * restart, network blip) after a fixed delay.
 */
export function useLiveUpdates(onEvent: (event: LiveUpdateEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as LiveUpdateEvent;
          onEventRef.current(event);
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);
}