import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, EmptyState, Icon, Spinner } from "../../components/ui";
import type { TerminalState } from "../../types";

function formatRemaining(seconds?: number) {
  const total = Math.max(0, seconds || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function terminalSocketUrl() {
  const token = localStorage.getItem("token") || "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/v1/terminal/ws?token=${encodeURIComponent(token)}`;
}

export function PlayerTerminalPage() {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [state, setState] = useState<TerminalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get<TerminalState>("/terminal/session");
      setState(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to load terminal session.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = useMemo(() => {
    const session = state?.session;
    if (!session) return 0;
    return Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));
  }, [state?.session?.expires_at, tick]);

  const running = state?.session?.status === "running" && remaining > 0;

  const disconnectTerminal = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    terminalRef.current?.dispose();
    terminalRef.current = null;
    fitRef.current = null;
    setConnected(false);
  }, []);

  const fitAndResize = useCallback(() => {
    const term = terminalRef.current;
    const fit = fitRef.current;
    const socket = socketRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(`__resize__:${term.cols}:${term.rows}`);
      }
    } catch {
      // container may be hidden during layout changes
    }
  }, []);

  const connectTerminal = useCallback(() => {
    if (!running || !terminalHostRef.current) return;
    disconnectTerminal();

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.15,
      scrollback: 5000,
      convertEol: true,
      allowProposedApi: false,
      theme: {
        background: "#05070d",
        foreground: "#d8deee",
        cursor: "#9fb9ff",
        selectionBackground: "#284675",
        black: "#0b0f18",
        red: "#ff6b6b",
        green: "#6ee7b7",
        yellow: "#ffd166",
        blue: "#7aa2ff",
        magenta: "#c084fc",
        cyan: "#67e8f9",
        white: "#edf0fa",
        brightBlack: "#737888",
        brightRed: "#ff8f86",
        brightGreen: "#99f6e4",
        brightYellow: "#fde68a",
        brightBlue: "#b4c5ff",
        brightMagenta: "#d8b4fe",
        brightCyan: "#a5f3fc",
        brightWhite: "#ffffff",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalHostRef.current);
    term.writeln("\x1b[38;5;111mConnecting to Romulus terminal...\x1b[0m");

    const ws = new WebSocket(terminalSocketUrl());
    socketRef.current = ws;
    terminalRef.current = term;
    fitRef.current = fit;

    ws.onopen = () => {
      setConnected(true);
      term.focus();
      window.setTimeout(fitAndResize, 50);
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      }
    };
    ws.onerror = () => {
      setError("Terminal WebSocket failed. Check backend logs and Docker socket access.");
    };
    ws.onclose = () => {
      setConnected(false);
      term.writeln("\r\n\x1b[38;5;203m[terminal disconnected]\x1b[0m");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  }, [disconnectTerminal, fitAndResize, running]);

  useEffect(() => {
    if (running) {
      const id = window.setTimeout(connectTerminal, 100);
      return () => window.clearTimeout(id);
    }
    disconnectTerminal();
  }, [running, connectTerminal, disconnectTerminal]);

  useEffect(() => {
    window.addEventListener("resize", fitAndResize);
    return () => window.removeEventListener("resize", fitAndResize);
  }, [fitAndResize]);

  useEffect(() => () => disconnectTerminal(), [disconnectTerminal]);

  const mutateSession = async (path: string, method: "post" | "delete" = "post") => {
    setBusy(true);
    setError("");
    disconnectTerminal();
    try {
      const { data } = method === "delete"
        ? await api.delete<TerminalState>(path)
        : await api.post<TerminalState>(path);
      setState(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Terminal action failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Terminal"
          subtitle="A true interactive Ubuntu terminal: vim, tab completion, arrows, Ctrl+C, full-screen tools and shell editing all work through the browser."
          action={
            <Button variant="secondary" onClick={load} disabled={busy}>
              <Icon name="refresh" className="text-base" />
              Refresh
            </Button>
          }
        />

        {loading ? <Spinner /> : !state?.available ? (
          <EmptyState icon="terminal" title="Terminal disabled" description="An administrator has disabled player terminal access." />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
            <Card className="min-h-[690px] flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.8)]" : running ? "bg-amber-300" : "bg-[#737888]"}`} />
                  <div>
                    <h2 className="font-semibold text-[#edf0fa]">Ubuntu interactive shell</h2>
                    <p className="text-xs text-[#858b9d]">{state.settings.image}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {state.session && <Badge color={running ? "green" : "gray"}>{state.session.status}</Badge>}
                  {state.session && <Badge color="primary">{formatRemaining(remaining)}</Badge>}
                  {connected && <Badge color="cyan">TTY connected</Badge>}
                </div>
              </div>

              {!state.session || !running ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-[#356df3]/15 border border-[#6f91ef]/25 flex items-center justify-center mx-auto mb-4">
                      <Icon name="terminal" className="text-3xl text-[#b4c5ff]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#edf0fa] mb-2">
                      {state.session?.status === "expired" ? "Terminal expired" : "No running terminal"}
                    </h3>
                    <p className="text-sm text-[#8d90a0] mb-5">
                      Start a fresh isolated container. Respawn creates a clean Ubuntu workspace.
                    </p>
                    <Button onClick={() => mutateSession(state.session ? "/terminal/session/respawn" : "/terminal/session")} disabled={busy}>
                      <Icon name={state.session ? "restart_alt" : "play_arrow"} className="text-base" />
                      {state.session ? "Respawn terminal" : "Start terminal"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative flex-1 rounded-2xl bg-[#05070d] border border-white/[0.08] overflow-hidden shadow-inner">
                  <div ref={terminalHostRef} className="absolute inset-0 p-3 terminal-host" />
                </div>
              )}
            </Card>

            <div className="space-y-5">
              <Card>
                <h3 className="font-semibold text-[#edf0fa] mb-4 flex items-center gap-2">
                  <Icon name="timer" className="text-[#b4c5ff]" />
                  Session control
                </h3>
                <div className="space-y-3 text-sm text-[#a5a9b8]">
                  <p>Default time: <span className="text-[#edf0fa]">{state.settings.default_minutes} minutes</span></p>
                  <p>Extension: <span className="text-[#edf0fa]">{state.settings.extension_minutes} minutes</span></p>
                  <p>Extensions left: <span className="text-[#edf0fa]">{state.session?.extensions_remaining ?? state.settings.max_extensions}</span></p>
                  <p>Network: <span className="text-[#edf0fa]">{state.settings.network_enabled ? "enabled" : "disabled"}</span></p>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2">
                  <Button variant="secondary" onClick={() => mutateSession("/terminal/session/extend")} disabled={!running || busy || (state.session?.extensions_remaining ?? 0) <= 0}>
                    <Icon name="more_time" className="text-base" />
                    Extend
                  </Button>
                  <Button variant="secondary" onClick={() => mutateSession("/terminal/session/respawn")} disabled={busy}>
                    <Icon name="restart_alt" className="text-base" />
                    Respawn clean
                  </Button>
                  <Button variant="danger" onClick={() => mutateSession("/terminal/session", "delete")} disabled={!state.session || busy}>
                    <Icon name="stop_circle" className="text-base" />
                    Stop terminal
                  </Button>
                </div>
              </Card>

              {error && (
                <Card className="!border-[#93000a]/60 !bg-[#93000a]/10">
                  <div className="flex gap-3 text-[#ffb4ab]">
                    <Icon name="error" filled />
                    <p className="text-sm">{error}</p>
                  </div>
                </Card>
              )}

              <Card>
                <h3 className="font-semibold text-[#edf0fa] mb-2">Works like a local shell</h3>
                <ul className="space-y-2 text-sm text-[#8d90a0]">
                  <li>• Use <span className="font-mono text-[#c3c6d7]">vim</span>, <span className="font-mono text-[#c3c6d7]">nano</span>, tab completion and arrow history.</li>
                  <li>• Ctrl+C, Ctrl+D, full-screen apps and terminal resizing are forwarded.</li>
                  <li>• Respawn wipes the container and gives you a clean workspace.</li>
                </ul>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
