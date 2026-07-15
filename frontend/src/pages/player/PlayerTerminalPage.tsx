import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, EmptyState, Icon, Spinner } from "../../components/ui";
import type { TerminalExecResult, TerminalState } from "../../types";

type HistoryLine = {
  command: string;
  output: string;
  exit_code: number;
  time: string;
};

function formatRemaining(seconds?: number) {
  const total = Math.max(0, seconds || 0);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

export function PlayerTerminalPage() {
  const [state, setState] = useState<TerminalState | null>(null);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
    const fromExpiry = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
    return Math.max(0, fromExpiry);
  }, [state?.session?.expires_at, tick]);

  const mutateSession = async (path: string, method: "post" | "delete" = "post") => {
    setBusy(true);
    setError("");
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

  const run = async () => {
    const text = command.trim();
    if (!text) return;
    setBusy(true);
    setError("");
    setCommand("");
    try {
      const { data } = await api.post<TerminalExecResult>("/terminal/exec", { command: text });
      setHistory((prev) => [{ command: text, output: data.output, exit_code: data.exit_code, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
      if (data.session && state) setState({ ...state, session: data.session });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Command failed.");
    } finally {
      setBusy(false);
    }
  };

  const session = state?.session;
  const running = session?.status === "running" && remaining > 0;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Terminal"
          subtitle="Your isolated Ubuntu workspace for lab commands. Sessions expire automatically based on the admin policy."
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
            <Card className="min-h-[620px] flex flex-col">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${running ? "bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.8)]" : "bg-[#737888]"}`} />
                  <div>
                    <h2 className="font-semibold text-[#edf0fa]">Ubuntu terminal</h2>
                    <p className="text-xs text-[#858b9d]">{state.settings.image}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {session && <Badge color={running ? "green" : "gray"}>{session.status}</Badge>}
                  {session && <Badge color="primary">{formatRemaining(remaining)}</Badge>}
                </div>
              </div>

              {!session || !running ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md">
                    <div className="w-16 h-16 rounded-2xl bg-[#356df3]/15 border border-[#6f91ef]/25 flex items-center justify-center mx-auto mb-4">
                      <Icon name="terminal" className="text-3xl text-[#b4c5ff]" />
                    </div>
                    <h3 className="text-lg font-semibold text-[#edf0fa] mb-2">
                      {session?.status === "expired" ? "Terminal expired" : "No running terminal"}
                    </h3>
                    <p className="text-sm text-[#8d90a0] mb-5">
                      Start a fresh isolated container. If a previous session expired, respawn creates a clean workspace.
                    </p>
                    <Button onClick={() => mutateSession(session ? "/terminal/session/respawn" : "/terminal/session")} disabled={busy}>
                      <Icon name={session ? "restart_alt" : "play_arrow"} className="text-base" />
                      {session ? "Respawn terminal" : "Start terminal"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl bg-[#05070d] border border-white/[0.08] p-4 flex-1 overflow-y-auto font-mono text-sm">
                    {history.length === 0 ? (
                      <div className="text-[#737888]">
                        <p>Romulus terminal ready.</p>
                        <p className="mt-2">Try: <span className="text-[#b4c5ff]">whoami</span>, <span className="text-[#b4c5ff]">pwd</span>, <span className="text-[#b4c5ff]">ls -la</span></p>
                      </div>
                    ) : history.map((item, idx) => (
                      <div key={`${item.time}-${idx}`} className="mb-5">
                        <div className="flex items-center gap-2 text-[#6ee7b7]">
                          <span>analyst@romulus:~$</span>
                          <span className="text-[#edf0fa]">{item.command}</span>
                        </div>
                        <pre className={`mt-2 whitespace-pre-wrap break-words ${item.exit_code === 0 ? "text-[#c3c6d7]" : "text-[#ffb4ab]"}`}>{item.output || "(no output)"}</pre>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2 rounded-2xl bg-[#0b0f18]/90 border border-white/[0.1] p-2">
                    <span className="hidden sm:inline-flex items-center pl-2 font-mono text-sm text-[#6ee7b7]">$</span>
                    <input
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") run(); }}
                      disabled={busy}
                      placeholder="Enter command..."
                      className="flex-1 bg-transparent px-2 py-2 text-sm text-[#edf0fa] placeholder-[#737888] focus:outline-none font-mono"
                    />
                    <Button onClick={run} disabled={busy || !command.trim()} size="sm">
                      <Icon name="keyboard_return" className="text-base" />
                      Run
                    </Button>
                  </div>
                </>
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
                  <p>Extensions left: <span className="text-[#edf0fa]">{session?.extensions_remaining ?? state.settings.max_extensions}</span></p>
                  <p>Command timeout: <span className="text-[#edf0fa]">{state.settings.command_timeout_seconds}s</span></p>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-2">
                  <Button variant="secondary" onClick={() => mutateSession("/terminal/session/extend")} disabled={!running || busy || (session?.extensions_remaining ?? 0) <= 0}>
                    <Icon name="more_time" className="text-base" />
                    Extend
                  </Button>
                  <Button variant="secondary" onClick={() => mutateSession("/terminal/session/respawn")} disabled={busy}>
                    <Icon name="restart_alt" className="text-base" />
                    Respawn clean
                  </Button>
                  <Button variant="danger" onClick={() => mutateSession("/terminal/session", "delete")} disabled={!session || busy}>
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
                <h3 className="font-semibold text-[#edf0fa] mb-2">Safety notes</h3>
                <ul className="space-y-2 text-sm text-[#8d90a0]">
                  <li>• This is an isolated training container, not the host shell.</li>
                  <li>• Long commands are killed by the configured timeout.</li>
                  <li>• Respawn resets the workspace to a clean container.</li>
                </ul>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
