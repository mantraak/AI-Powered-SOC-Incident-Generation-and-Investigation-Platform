"""
In-process WebSocket connection manager for collaborative lab groups.

Scope / limitations (documented on purpose):
- Connections are tracked in memory, keyed by `group_id`. This is sufficient
  for a single backend process/worker. If the app is later scaled to multiple
  uvicorn/gunicorn workers, broadcasting should be swapped to use the Redis
  instance already configured in `settings.REDIS_URL` (pub/sub) so events
  reach clients connected to a different worker. The public API of this
  module (`connect`, `disconnect`, `broadcast`) is intentionally small so
  that swap can happen without touching call sites.
"""
import json
from datetime import datetime, timezone
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # group_id -> {user_id -> set of active websocket connections}
        self._groups: Dict[int, Dict[int, Set[WebSocket]]] = {}

    async def connect(self, group_id: int, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._groups.setdefault(group_id, {}).setdefault(user_id, set()).add(websocket)

    def disconnect(self, group_id: int, user_id: int, websocket: WebSocket) -> None:
        group = self._groups.get(group_id)
        if not group:
            return
        sockets = group.get(user_id)
        if sockets and websocket in sockets:
            sockets.discard(websocket)
        if sockets is not None and not sockets:
            group.pop(user_id, None)
        if not group:
            self._groups.pop(group_id, None)

    def online_user_ids(self, group_id: int) -> Set[int]:
        return set(self._groups.get(group_id, {}).keys())

    async def broadcast(self, group_id: int, event_type: str, payload: dict) -> None:
        group = self._groups.get(group_id)
        if not group:
            return
        message = json.dumps({
            "type": event_type,
            "payload": payload,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
        dead: list = []
        for user_id, sockets in group.items():
            for ws in sockets:
                try:
                    await ws.send_text(message)
                except Exception:
                    dead.append((user_id, ws))
        for user_id, ws in dead:
            self.disconnect(group_id, user_id, ws)


# Single process-wide instance, imported by the REST endpoints (to push
# events after a mutation) and by the websocket endpoint itself.
manager = ConnectionManager()
