import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { ChatComposer, ChatThread, SuggestionChip, WebSearchToggle } from "../../components/assistant/ChatThread";
import { Badge, Button, Card, Icon, StatusBadge } from "../../components/ui";
import type { ChatMessage, Lab, PlayerChatResponse, Scenario } from "../../types";

const SUGGESTIONS = [
  "How do I tell a malicious PowerShell command from a normal admin one?",
  "Walk me through a method for building an incident timeline.",
  "Explain MITRE T1566 and what evidence usually proves it.",
  "Which Sysmon event IDs matter for lateral movement, and why?",
];

export function PlayerAIAssistantPage() {
  const [params] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [webSearch, setWebSearch] = useState(false);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [labId, setLabId] = useState<number | null>(() => {
    const value = Number(params.get("lab"));
    return Number.isFinite(value) && value > 0 ? value : null;
  });

  useEffect(() => {
    api.get<Lab[]>("/labs/my").then((response) => setLabs(response.data)).catch(() => setLabs([]));
    api
      .get<Scenario[]>("/scenarios/published")
      .then((response) =>
        setTitles(Object.fromEntries(response.data.map((scenario) => [scenario.id, scenario.title])))
      )
      .catch(() => setTitles({}));
  }, []);

  const activeLab = labs.find((lab) => lab.id === labId) ?? null;
  const labTitle = (lab: Lab) => titles[lab.scenario_id] ?? `Scenario #${lab.scenario_id}`;

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || loading) return;

    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await api.post<PlayerChatResponse>("/assistant/player/chat", {
        messages: history.map(({ role, content: value }) => ({ role, content: value })),
        lab_id: labId,
        web_search: webSearch,
      });
      setMessages([
        ...history,
        {
          role: "assistant",
          content: response.data.reply,
          guarded: response.data.guarded,
          searchResults: response.data.search_results,
        },
      ]);
      if (response.data.search_error) setError(response.data.search_error);
    } catch (err: any) {
      setMessages(history);
      setError(err.response?.data?.detail || "The mentor is unavailable right now. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="AI Mentor"
          subtitle="Ask about techniques, tools, and methodology — the mentor coaches you, it does not answer lab questions for you"
          action={
            messages.length > 0 ? (
              <Button variant="secondary" onClick={() => { setMessages([]); setError(""); }}>
                <Icon name="restart_alt" className="text-base" />
                New chat
              </Button>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
          {/* ── Chat ── */}
          <Card className="!p-0 flex flex-col h-[calc(100vh-260px)] min-h-[520px] overflow-hidden">
            {(activeLab || webSearch) && (
              <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#0b0f18]/50 flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8d90a0] font-semibold">Coaching on</span>
                {activeLab && (
                  <Badge color="cyan">
                    <Icon name="science" className="text-[13px]" />
                    {labTitle(activeLab)}
                  </Badge>
                )}
                {webSearch && (
                  <Badge color="green">
                    <Icon name="travel_explore" className="text-[13px]" />
                    Live web
                  </Badge>
                )}
                {activeLab && (
                  <span className="text-[11px] text-[#737888]">answer key withheld from the mentor</span>
                )}
              </div>
            )}

            <ChatThread
              messages={messages}
              loading={loading}
              emptyState={
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#356df3]/10 border border-[#668cff]/20 flex items-center justify-center mb-4 shadow-[0_0_35px_-15px_rgba(53,109,243,.8)]">
                    <Icon name="school" className="text-2xl text-[#b4c5ff]" />
                  </div>
                  <h3 className="text-base font-semibold text-[#e1e2ed] mb-1.5">Stuck? Ask for a method, not an answer</h3>
                  <p className="text-sm text-[#8d90a0] max-w-md mb-6">
                    The mentor explains concepts, log formats, SOC tooling, and ATT&CK techniques so you can find
                    the evidence yourself. It will not name the IPs, hosts, hashes, or techniques your lab asks for.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2 w-full max-w-2xl">
                    {SUGGESTIONS.map((text) => (
                      <SuggestionChip key={text} text={text} onClick={send} />
                    ))}
                  </div>
                </div>
              }
            />

            {error && (
              <div className="mx-4 mb-2 p-2.5 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-xs flex items-start gap-2">
                <Icon name="error" filled className="text-sm flex-shrink-0" />
                {error}
              </div>
            )}

            <ChatComposer
              value={draft}
              onChange={setDraft}
              onSend={() => send()}
              disabled={loading}
              placeholder="Ask a concept, a tool, or how to approach a step…"
            />
          </Card>

          {/* ── Sidebar ── */}
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-white/[0.08]">
                <Icon name="travel_explore" className="text-[#b4c5ff] text-lg" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Live research</h3>
              </div>
              <WebSearchToggle
                enabled={webSearch}
                onToggle={setWebSearch}
                label="Search DuckDuckGo"
                hint="Looks up current references for the concept you asked about. Your lab's evidence is synthetic — it is not on the public web."
              />
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-white/[0.08]">
                <Icon name="biotech" className="text-[#b4c5ff] text-lg" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Lab context</h3>
              </div>
              <p className="text-[11px] text-[#8d90a0] mb-3 leading-relaxed">
                Pick a lab so the mentor knows what you are working on. It sees the questions — never the answers.
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => setLabId(null)}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                    labId === null
                      ? "bg-[#2563eb]/15 border-[#2563eb]/40 text-[#c8d5ff]"
                      : "bg-white/[0.03] border-white/[0.07] text-[#c3c6d7] hover:bg-white/[0.07]"
                  }`}
                >
                  <p className="text-xs font-medium">General questions</p>
                  <p className="text-[10px] text-[#8d90a0] mt-0.5">No lab attached</p>
                </button>
                {labs.map((lab) => (
                  <button
                    key={lab.id}
                    type="button"
                    onClick={() => setLabId(lab.id)}
                    data-testid={`assistant-lab-${lab.id}`}
                    className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                      labId === lab.id
                        ? "bg-[#2563eb]/15 border-[#2563eb]/40"
                        : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.07]"
                    }`}
                  >
                    <p className="text-xs font-medium text-[#e1e2ed] truncate">{labTitle(lab)}</p>
                    <div className="mt-1"><StatusBadge status={lab.status} /></div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="!bg-[linear-gradient(145deg,rgba(42,31,8,.7),rgba(19,22,31,.96))] !border-amber-700/40">
              <div className="flex items-center gap-2 mb-2.5">
                <Icon name="shield" filled className="text-amber-300 text-lg" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Academic integrity</h3>
              </div>
              <ul className="space-y-2 text-xs text-[#c3c6d7] leading-relaxed">
                <li className="flex gap-2"><span className="text-amber-300">▸</span>The mentor never receives your lab's answer key, IOCs, or generated evidence.</li>
                <li className="flex gap-2"><span className="text-amber-300">▸</span>Answer-shaped values are stripped from replies before you see them.</li>
                <li className="flex gap-2"><span className="text-amber-300">▸</span>Ask "how do I approach this?" rather than "what is the answer?" — you will get further.</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
