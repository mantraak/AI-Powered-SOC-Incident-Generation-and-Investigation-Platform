from __future__ import annotations

import asyncio
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Callable

try:
    import docker
    from docker.errors import DockerException, ImageNotFound, NotFound
except Exception:  # pragma: no cover - lets the app boot even before dependency install
    docker = None
    DockerException = Exception
    ImageNotFound = Exception
    NotFound = Exception

from sqlalchemy.orm import Session

from app.models.lab import PlayerLab
from app.models.terminal import TerminalSession, TerminalSetting
from app.models.user import User


class TerminalError(RuntimeError):
    pass


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_terminal_settings(db: Session) -> TerminalSetting:
    settings = db.query(TerminalSetting).order_by(TerminalSetting.id.asc()).first()
    if not settings:
        settings = TerminalSetting()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def terminal_setting_payload(settings: TerminalSetting) -> dict:
    return {
        "enabled": settings.enabled,
        "image": settings.image,
        "default_minutes": settings.default_minutes,
        "extension_minutes": settings.extension_minutes,
        "max_extensions": settings.max_extensions,
        "command_timeout_seconds": settings.command_timeout_seconds,
        "network_enabled": settings.network_enabled,
        "memory_limit": settings.memory_limit,
        "cpu_quota": settings.cpu_quota,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


def session_payload(session: TerminalSession | None, settings: TerminalSetting) -> dict:
    if not session:
        return {
            "available": settings.enabled,
            "session": None,
            "settings": terminal_setting_payload(settings),
        }
    remaining = max(0, int((as_utc(session.expires_at) - now_utc()).total_seconds()))
    return {
        "available": settings.enabled,
        "session": {
            "id": session.id,
            "lab_id": session.lab_id,
            "image": session.image,
            "status": session.status,
            "container_name": session.container_name,
            "expires_at": session.expires_at.isoformat(),
            "remaining_seconds": remaining,
            "extensions_used": session.extensions_used,
            "extensions_remaining": max(0, settings.max_extensions - session.extensions_used),
            "last_command": session.last_command,
            "last_error": session.last_error,
            "created_at": session.created_at.isoformat() if session.created_at else None,
        },
        "settings": terminal_setting_payload(settings),
    }


def _docker_client():
    if docker is None:
        raise TerminalError("Docker SDK is not installed in the backend image. Rebuild the backend.")
    try:
        return docker.from_env()
    except DockerException as exc:
        raise TerminalError("Backend cannot connect to Docker. Mount /var/run/docker.sock into the backend container.") from exc


def _safe_name(player_id: int, lab_id: int | None) -> str:
    suffix = f"lab-{lab_id}" if lab_id else "general"
    return f"romulus-terminal-p{player_id}-{suffix}"


def _validate_image(image: str) -> str:
    image = image.strip()
    if not image or len(image) > 180:
        raise TerminalError("Terminal image is invalid.")
    if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9._:/@-]+$", image):
        raise TerminalError("Terminal image contains unsupported characters.")
    return image


def _stop_container(container_id_or_name: str | None) -> None:
    if not container_id_or_name:
        return
    client = _docker_client()
    try:
        container = client.containers.get(container_id_or_name)
        try:
            container.stop(timeout=3)
        finally:
            container.remove(force=True)
    except NotFound:
        return
    except DockerException as exc:
        raise TerminalError(f"Failed to remove terminal container: {exc}") from exc


def _ensure_lab_access(db: Session, user: User, lab_id: int | None) -> PlayerLab | None:
    if lab_id is None:
        return None
    lab = db.query(PlayerLab).filter(PlayerLab.id == lab_id, PlayerLab.player_id == user.id).first()
    if not lab:
        raise TerminalError("Lab not found or not assigned to this player.")
    return lab


def get_active_session(db: Session, user: User, lab_id: int | None) -> TerminalSession | None:
    query = db.query(TerminalSession).filter(TerminalSession.player_id == user.id)
    query = query.filter(TerminalSession.lab_id == lab_id) if lab_id else query.filter(TerminalSession.lab_id.is_(None))
    return query.order_by(TerminalSession.created_at.desc()).first()


def expire_if_needed(db: Session, session: TerminalSession | None) -> TerminalSession | None:
    if not session:
        return None
    if session.status == "running" and as_utc(session.expires_at) <= now_utc():
        try:
            _stop_container(session.container_id or session.container_name)
        except TerminalError as exc:
            session.last_error = str(exc)
        session.status = "expired"
        db.commit()
        db.refresh(session)
    return session


def spawn_session(db: Session, user: User, lab_id: int | None = None, respawn: bool = False) -> TerminalSession:
    settings = get_terminal_settings(db)
    if not settings.enabled:
        raise TerminalError("Player terminal is currently disabled by the administrator.")
    _ensure_lab_access(db, user, lab_id)

    existing = expire_if_needed(db, get_active_session(db, user, lab_id))
    if existing and existing.status == "running" and not respawn:
        return existing
    if existing and respawn:
        try:
            _stop_container(existing.container_id or existing.container_name)
        except TerminalError as exc:
            existing.last_error = str(exc)
        existing.status = "stopped"
        db.commit()

    client = _docker_client()
    image = _validate_image(settings.image)
    name = _safe_name(user.id, lab_id)
    try:
        _stop_container(name)
    except TerminalError:
        pass

    try:
        try:
            client.images.get(image)
        except ImageNotFound:
            client.images.pull(image)

        container = client.containers.run(
            image=image,
            command=["sleep", "infinity"],
            detach=True,
            name=name,
            tty=True,
            stdin_open=False,
            network_disabled=not settings.network_enabled,
            mem_limit=settings.memory_limit,
            cpu_quota=settings.cpu_quota,
            labels={
                "romulus.owner": "terminal",
                "romulus.player_id": str(user.id),
                "romulus.lab_id": str(lab_id or ""),
            },
        )
    except DockerException as exc:
        raise TerminalError(f"Failed to start terminal container: {exc}") from exc

    session = TerminalSession(
        player_id=user.id,
        lab_id=lab_id,
        container_id=container.id,
        container_name=name,
        image=image,
        status="running",
        expires_at=now_utc() + timedelta(minutes=max(1, settings.default_minutes)),
        extensions_used=0,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def extend_session(db: Session, user: User, lab_id: int | None = None) -> TerminalSession:
    settings = get_terminal_settings(db)
    session = expire_if_needed(db, get_active_session(db, user, lab_id))
    if not session or session.status != "running":
        raise TerminalError("No running terminal session to extend.")
    if session.extensions_used >= settings.max_extensions:
        raise TerminalError("No terminal extensions remaining.")
    session.expires_at = max(as_utc(session.expires_at), now_utc()) + timedelta(minutes=max(1, settings.extension_minutes))
    session.extensions_used += 1
    db.commit()
    db.refresh(session)
    return session


def stop_session(db: Session, user: User, lab_id: int | None = None) -> TerminalSession:
    session = get_active_session(db, user, lab_id)
    if not session:
        raise TerminalError("No terminal session found.")
    _stop_container(session.container_id or session.container_name)
    session.status = "stopped"
    db.commit()
    db.refresh(session)
    return session


def exec_command(db: Session, user: User, command: str, lab_id: int | None = None) -> dict:
    settings = get_terminal_settings(db)
    if not settings.enabled:
        raise TerminalError("Player terminal is currently disabled by the administrator.")
    command = command.strip()
    if not command:
        raise TerminalError("Command cannot be empty.")
    if len(command) > 2000:
        raise TerminalError("Command is too long.")

    session = expire_if_needed(db, get_active_session(db, user, lab_id))
    if not session or session.status != "running":
        raise TerminalError("Terminal is not running. Start or respawn it first.")

    client = _docker_client()
    try:
        container = client.containers.get(session.container_id or session.container_name)
        result = container.exec_run(
            ["timeout", f"{max(1, settings.command_timeout_seconds)}s", "bash", "-lc", command],
            workdir="/root",
            stdout=True,
            stderr=True,
            stdin=False,
            tty=False,
        )
    except DockerException as exc:
        session.last_error = str(exc)
        db.commit()
        raise TerminalError(f"Command failed: {exc}") from exc

    output = result.output.decode("utf-8", errors="replace") if isinstance(result.output, bytes) else str(result.output)
    session.last_command = command
    session.last_error = None if result.exit_code == 0 else output[-1000:]
    db.commit()
    return {
        "command": command,
        "exit_code": result.exit_code,
        "output": output[-20000:],
        "session": session_payload(session, settings)["session"],
    }


def _raw_socket(sock):
    return getattr(sock, "_sock", None) or getattr(sock, "socket", None) or sock


def _send_socket(raw_sock, data: bytes) -> None:
    if hasattr(raw_sock, "sendall"):
        raw_sock.sendall(data)
    else:
        raw_sock.send(data)


def open_interactive_exec(db: Session, user: User, lab_id: int | None = None):
    """Open an interactive bash TTY inside the player's running container."""
    settings = get_terminal_settings(db)
    if not settings.enabled:
        raise TerminalError("Player terminal is currently disabled by the administrator.")
    session = expire_if_needed(db, get_active_session(db, user, lab_id))
    if not session or session.status != "running":
        raise TerminalError("Terminal is not running. Start or respawn it first.")

    client = _docker_client()
    try:
        container = client.containers.get(session.container_id or session.container_name)
        exec_info = client.api.exec_create(
            container.id,
            cmd="/bin/bash",
            stdin=True,
            tty=True,
            workdir="/root",
            environment={"TERM": "xterm-256color"},
        )
        socket_obj = client.api.exec_start(exec_info["Id"], tty=True, socket=True)
        return exec_info["Id"], _raw_socket(socket_obj), client
    except DockerException as exc:
        raise TerminalError(f"Failed to open interactive terminal: {exc}") from exc


def resize_interactive_exec(exec_id: str, client, cols: int, rows: int) -> None:
    try:
        client.api.exec_resize(exec_id, height=max(10, rows), width=max(20, cols))
    except Exception:
        pass


async def bridge_terminal_socket(
    websocket,
    raw_sock,
    on_resize: Callable[[int, int], None] | None = None,
) -> None:
    """Bridge Docker's raw exec socket to a browser WebSocket."""
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes | None] = asyncio.Queue()
    stop = threading.Event()

    def reader() -> None:
        try:
            while not stop.is_set():
                data = raw_sock.recv(4096)
                if not data:
                    break
                loop.call_soon_threadsafe(queue.put_nowait, data)
        except Exception:
            pass
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    thread = threading.Thread(target=reader, daemon=True)
    thread.start()

    async def browser_to_container() -> None:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if message.get("text") is not None:
                text = message["text"]
                if text.startswith("__resize__:"):
                    try:
                        _, cols, rows = text.split(":", 2)
                        if on_resize:
                            on_resize(int(cols), int(rows))
                    except Exception:
                        pass
                    continue
                await asyncio.to_thread(_send_socket, raw_sock, text.encode("utf-8", errors="ignore"))
            elif message.get("bytes") is not None:
                await asyncio.to_thread(_send_socket, raw_sock, message["bytes"])

    async def container_to_browser() -> None:
        while True:
            data = await queue.get()
            if data is None:
                break
            await websocket.send_text(data.decode("utf-8", errors="replace"))

    try:
        tasks = [
            asyncio.create_task(browser_to_container()),
            asyncio.create_task(container_to_browser()),
        ]
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            task.result()
    finally:
        stop.set()
        try:
            raw_sock.close()
        except Exception:
            pass
