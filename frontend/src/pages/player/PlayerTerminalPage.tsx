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

function timeTone(seconds: number) {
  if (seconds <= 60) return "red";
  if (seconds <= 300) return "yellow";
  return "green";
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
  const totalSeconds = Math.max(1, (state?.settings.default_minutes || 1) * 60);
  const remainingPct = Math.max(0, Math.min(100, (remaining / totalSeconds) * 100));

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
      // xterm can throw while hidden/resizing; harmless.
    }
  }, []);

  const connectTerminal = useCallback(() => {
    if (!running || !terminalHostRef.current) return;
    disconnectTerminal();

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.16,
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
      if (typeof event.data === "string") term.write(event.data);
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

  const sendQuickCommand = (cmd: string) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(`${cmd}\r`);
      terminalRef.current?.focus();
    }
  };

  const progressColor =
    timeTone(remaining) === "red"
      ? "bg-[#ff6b6b]"
      : timeTone(remaining) === "yellow"
        ? "bg-amber-300"
        : "bg-gradient-to-r from-emerald-400 to-[#67e8f9]";

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Terminal"
          subtitle="A browser-native Ubuntu workstation for vim, tab completion, shell history, Ctrl+C and full-screen tools."
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
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-3xl border border-[#557ff0]/25 bg-[radial-gradient(circle_at_15%_0%,rgba(53,109,243,.25),transparent_38%),linear-gradient(135deg,rgba(21,27,41,.98),rgba(9,12,20,.98))] p-5 shadow-[0_24px_70px_-42px_rgba(53,109,243,.9)]">
              <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#356df3]/20 blur-3xl" />
              <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 rounded-2xl bg-[#05070d]/80 border border-[#7f9eff]/25 flex items-center justify-center">
                    <Icon name="terminal" className="text-3xl text-[#b4c5ff]" />
                    <span className={`absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-[#101522] ${connected ? "bg-emerald-400" : running ? "bg-amber-300" : "bg-[#737888]"}`} />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-[#83a1f3] font-semibold">Player isolated workspace</p>
                    <h2 className="mt-1 text-xl font-bold text-[#edf0fa]">Ubuntu interactive shell</h2>
                    <p className="mt-1 text-sm text-[#8d90a0] font-mono">{state.settings.image}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#858b9d]">Status</p>
                    <p className="mt-1 text-sm font-semibold text-[#edf0fa]">{connected ? "Connected" : running ? "Starting" : state.session?.status || "Idle"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#858b9d]">Time left</p>
                    <p className={`mt-1 text-sm font-semibold ${remaining <= 60 ? "text-[#ffb4ab]" : remaining <= 300 ? "text-amber-300" : "text-emerald-300"}`}>{state.session ? formatRemaining(remaining) : "Not started"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#858b9d]">Network</p>
                    <p className="mt-1 text-sm font-semibold text-[#edf0fa]">{state.settings.network_enabled ? "Enabled" : "Isolated"}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#858b9d]">Extensions</p>
                    <p className="mt-1 text-sm font-semibold text-[#edf0fa]">{state.session?.extensions_remaining ?? state.settings.max_extensions} left</p>
                  </div>
                </div>
              </div>
              {state.session && (
                <div className="relative mt-5 h-2 rounded-full bg-white/[0.07] overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${remainingPct}%` }} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5">
              <Card className="min-h-[700px] flex flex-col !p-0 overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.08] bg-[#0b0f18]/70">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                      <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                      <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
                    </div>
                    <div className="hidden sm:block h-5 w-px bg-white/[0.1]" />
                    <div>
                      <p className="text-sm font-semibold text-[#e1e2ed]">romulus-terminal</p>
                      <p className="text-[11px] text-[#737888]">/root · TERM=xterm-256color</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {state.session && <Badge color={running ? "green" : "gray"}>{state.session.status}</Badge>}
                    {connected && <Badge color="cyan">TTY connected</Badge>}
                    <Button variant="ghost" size="sm" onClick={fitAndResize} disabled={!running}>
                      <Icon name="fit_screen" className="text-sm" />
                      Fit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => terminalRef.current?.focus()} disabled={!running}>
                      <Icon name="my_location" className="text-sm" />
                      Focus
                    </Button>
                  </div>
                </div>

                {!state.session || !running ? (
                  <div className="flex-1 flex items-center justify-center px-5">
                    <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0f18]/70 p-8 text-center max-w-md">
                      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[#356df3]/15 blur-3xl" />
                      <div className="relative">
                        <div className="w-16 h-16 rounded-2xl bg-[#356df3]/15 border border-[#6f91ef]/25 flex items-center justify-center mx-auto mb-4">
                          <Icon name="terminal" className="text-3xl text-[#b4c5ff]" />
                        </div>
                        <h3 className="text-lg font-semibold text-[#edf0fa] mb-2">
                          {state.session?.status === "expired" ? "Terminal expired" : "No running terminal"}
                        </h3>
                        <p className="text-sm text-[#8d90a0] mb-5">
                          Start a fresh isolated Ubuntu workspace. Respawn gives you a clean container.
                        </p>
                        <Button onClick={() => mutateSession(state.session ? "/terminal/session/respawn" : "/terminal/session")} disabled={busy}>
                          <Icon name={state.session ? "restart_alt" : "play_arrow"} className="text-base" />
                          {state.session ? "Respawn terminal" : "Start terminal"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative flex-1 bg-[#05070d] overflow-hidden shadow-inner">
                    <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#7f9eff]/5 to-transparent pointer-events-none z-10" />
                    <div ref={terminalHostRef} className="absolute inset-0 p-4 terminal-host" />
                  </div>
                )}
              </Card>

              <div className="space-y-5">
                <Card>
                  <h3 className="font-semibold text-[#edf0fa] mb-4 flex items-center gap-2">
                    <Icon name="timer" className="text-[#b4c5ff]" />
                    Session control
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white/[0.035] border border-white/[0.08] p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#858b9d]">Default</p>
                      <p className="mt-1 font-semibold text-[#edf0fa]">{state.settings.default_minutes}m</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.035] border border-white/[0.08] p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#858b9d]">Extend by</p>
                      <p className="mt-1 font-semibold text-[#edf0fa]">{state.settings.extension_minutes}m</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.035] border border-white/[0.08] p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#858b9d]">Memory</p>
                      <p className="mt-1 font-semibold text-[#edf0fa]">{state.settings.memory_limit}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.035] border border-white/[0.08] p-3">
                      <p className="text-[10px] uppercase tracking-[0.14em] text-[#858b9d]">CPU quota</p>
                      <p className="mt-1 font-semibold text-[#edf0fa]">{state.settings.cpu_quota}</p>
                    </div>
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
                  <h3 className="font-semibold text-[#edf0fa] mb-3 flex items-center gap-2">
                    <Icon name="bolt" className="text-[#b4c5ff]" />
                    Quick commands
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {["whoami", "pwd", "ls -la", "ip a", "ps aux", "vim notes.txt"].map((cmd) => (
                      <button
                        key={cmd}
                        type="button"
                        onClick={() => sendQuickCommand(cmd)}
                        disabled={!connected}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-left font-mono text-xs text-[#c3c6d7] hover:border-[#7f9eff]/35 hover:text-[#edf0fa] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </Card>

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
          </div>
        )}
      </div>
    </AppLayout>
  );
}
