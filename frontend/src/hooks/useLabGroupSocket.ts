import { useEffect, useRef, useState, useCallback } from "react";
import { labGroupSocketUrl } from "../api/labGroups";

export interface LabGroupEvent {
  type: string;
  payload: any;
  ts: string;
}

/**
 * Connects to /api/v1/lab-groups/ws/{groupId} and calls `onEvent` for every
 * message. Reconnects with backoff on drop. Returns a `send` helper for the
 * lightweight client -> server signals (presence, typing) and a `connected`
 * flag the Presence UI can use.
 */
export function useLabGroupSocket(groupId: number | undefined, onEvent: (evt: LabGroupEvent) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const onEventRef = useRef(onEvent);
  const retryRef = useRef(0);
  const closedByUsRef = useRef(false);
  const [connected, setConnected] = useState(false);

  onEventRef.current = onEvent;

  useEffect(() => {
    if (!groupId) return;
    closedByUsRef.current = false;

    let timer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const ws = new WebSocket(labGroupSocketUrl(groupId!));
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          onEventRef.current(parsed);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (closedByUsRef.current) return;
        const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
        retryRef.current += 1;
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      closedByUsRef.current = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [groupId]);

  const send = useCallback((type: string, extra: Record<string, any> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, ...extra }));
    }
  }, []);

  return { connected, send };
}
