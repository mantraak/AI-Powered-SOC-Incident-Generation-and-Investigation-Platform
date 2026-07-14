import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { ChatComposer, ChatThread, SuggestionChip, WebSearchToggle } from "../../components/assistant/ChatThread";
import { Badge, Button, Card, Icon } from "../../components/ui";
import type { AdminChatResponse, AssistantScenarioHit, ChatMessage } from "../../types";

const SUGGESTIONS = [
  "What are the most significant cybersecurity incidents reported this week?",
  "Explain how an initial-access broker operates and which telemetry reveals them.",
  "What ATT&CK techniques should a phishing-to-domain-admin scenario cover?",
  "Review the selected incident and suggest three stronger investigation questions.",
];

const TIME_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any time" },
  { value: "d", label: "Past day" },
  { value: "w", label: "Past week" },
  { value: "m", label: "Past month" },
  { value: "y", label: "Past year" },
];

const inputCls =
  "w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none focus:border-[#7f9eff] focus:ring-4 focus:ring-[#356df3]/15 transition-all shadow-inner";

export function AdminAIAssistantPage() {
  const [params] = useSearchParams();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<AssistantScenarioHit[]>([]);
  const [scenario, setScenario] = useState<AssistantScenarioHit | null>(null);
  // Arriving from a Threat Feed article: preload it as a reference link to read.
  const [links, setLinks] = useState(() => params.get("link") ?? "");
  const [webSearch, setWebSearch] = useState(true);
  const [newsMode, setNewsMode] = useState(false);
  const [timelimit, setTimelimit] = useState("");

  useEffect(() => {
    const handle = setTimeout(async () => {
      try {
        const response = await api.get<AssistantScenarioHit[]>("/assistant/admin/scenarios", {
          params: { q: search },
        });
        setHits(response.data);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const send = async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || loading) return;

    const referenceLinks = links.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (referenceLinks.length > 4) {
      setError("Provide no more than four reference links.");
      return;
    }

    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(history);
    setDraft("");
    setError("");
    setLoading(true);
    try {
      const response = await api.post<AdminChatResponse>("/assistant/admin/chat", {
        messages: history.map(({ role, content: value }) => ({ role, content: value })),
        scenario_id: scenario?.id ?? null,
        links: referenceLinks,
        web_search: webSearch,
        news_mode: newsMode,
        timelimit: timelimit || null,
      });
      setMessages([
        ...history,
        {
          role: "assistant",
          content: response.data.reply,
          sources: response.data.sources,
          searchResults: response.data.search_results,
        },
      ]);
      const problems = [
        response.data.search_error,
        response.data.source_errors.length
          ? `Could not read: ${response.data.source_errors.map((item) => item.url).join(", ")}`
          : "",
      ].filter(Boolean);
      if (problems.length) setError(problems.join(" · "));
    } catch (err: any) {
      setMessages(history);
      setError(err.response?.data?.detail || "The AI assistant could not answer. Check Admin › AI Settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="AI Assistant"
          subtitle="Research cyber incidents, threat actors, and ATT&CK coverage — or ask about any incident stored on this platform"
          action={
            messages.length > 0 ? (
              <Button variant="secondary" onClick={() => { setMessages([]); setError(""); }}>
                <Icon name="restart_alt" className="text-base" />
                New chat
              </Button>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          {/* ── Chat ── */}
          <Card className="!p-0 flex flex-col h-[calc(100vh-260px)] min-h-[520px] overflow-hidden">
            {(scenario || links.trim() || webSearch) && (
              <div className="px-4 py-2.5 border-b border-white/[0.08] bg-[#0b0f18]/50 flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[#8d90a0] font-semibold">Grounded on</span>
                {webSearch && (
                  <Badge color="green">
                    <Icon name="travel_explore" className="text-[13px]" />
                    Live web{newsMode ? " news" : ""}
                  </Badge>
                )}
                {scenario && (
                  <Badge color="cyan">
                    <Icon name="folder_open" className="text-[13px]" />
                    {scenario.title}
                  </Badge>
                )}
                {links.trim() && (
                  <Badge color="blue">
                    <Icon name="link" className="text-[13px]" />
                    {links.split(/\r?\n/).filter((value) => value.trim()).length} link(s)
                  </Badge>
                )}
              </div>
            )}

            <ChatThread
              messages={messages}
              loading={loading}
              emptyState={
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#356df3]/10 border border-[#668cff]/20 flex items-center justify-center mb-4 shadow-[0_0_35px_-15px_rgba(53,109,243,.8)]">
                    <Icon name="neurology" className="text-2xl text-[#b4c5ff]" />
                  </div>
                  <h3 className="text-base font-semibold text-[#e1e2ed] mb-1.5">Ask about any incident</h3>
                  <p className="text-sm text-[#8d90a0] max-w-md mb-6">
                    Search a scenario on the right to ground the assistant on it, paste reference links for
                    up-to-date reporting, or just ask a threat-intelligence question.
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
              placeholder="Ask about a threat actor, a campaign, an ATT&CK technique, or a platform incident…"
            />
          </Card>

          {/* ── Context sidebar ── */}
          <div className="space-y-4">
            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-white/[0.08]">
                <Icon name="travel_explore" className="text-[#b4c5ff] text-lg" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Live web search</h3>
              </div>
              <WebSearchToggle
                enabled={webSearch}
                onToggle={setWebSearch}
                label="Search DuckDuckGo"
                hint="Searches the live web with your question and reads the top hits before answering."
              />
              {webSearch && (
                <div className="mt-3 space-y-2.5">
                  <label className="flex items-center gap-2 text-xs text-[#c3c6d7] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newsMode}
                      onChange={(event) => setNewsMode(event.target.checked)}
                      className="accent-[#356df3] w-3.5 h-3.5"
                    />
                    News results only
                  </label>
                  <div>
                    <label className="block text-[10px] font-semibold text-[#8d90a0] uppercase tracking-wider mb-1.5">
                      Recency
                    </label>
                    <select
                      value={timelimit}
                      onChange={(event) => setTimelimit(event.target.value)}
                      className={inputCls}
                    >
                      {TIME_FILTERS.map((filter) => (
                        <option key={filter.value} value={filter.value} className="bg-[#11131b]">
                          {filter.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-white/[0.08]">
                <Icon name="manage_search" className="text-[#b4c5ff] text-lg" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Platform incident</h3>
              </div>

              {scenario ? (
                <div className="rounded-xl bg-[#2563eb]/10 border border-[#2563eb]/30 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[#e1e2ed]">{scenario.title}</p>
                    <button
                      type="button"
                      onClick={() => setScenario(null)}
                      className="text-[#8d90a0] hover:text-[#ffb4ab] flex-shrink-0"
                      aria-label="Clear incident context"
                    >
                      <Icon name="close" className="text-base" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge color="gray">{scenario.difficulty}</Badge>
                    {scenario.mitre_techniques.slice(0, 4).map((id) => (
                      <Badge key={id} color="purple">{id}</Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search scenarios by title…"
                    className={inputCls}
                    data-testid="assistant-scenario-search"
                  />
                  <div className="mt-2.5 space-y-1.5 max-h-64 overflow-y-auto">
                    {hits.length === 0 && (
                      <p className="text-xs text-[#8d90a0] py-2">No matching scenarios.</p>
                    )}
                    {hits.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        onClick={() => setScenario(hit)}
                        className="w-full text-left px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] hover:border-[#6d96ff]/40 transition-all"
                      >
                        <p className="text-xs font-medium text-[#e1e2ed] truncate">{hit.title}</p>
                        <p className="text-[10px] text-[#8d90a0] uppercase tracking-wide mt-0.5">
                          {hit.difficulty} · {hit.status}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-white/[0.08]">
                <Icon name="link" className="text-[#b4c5ff] text-lg" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Reference links</h3>
              </div>
              <textarea
                value={links}
                onChange={(event) => setLinks(event.target.value)}
                rows={4}
                placeholder={"https://vendor.example/threat-report\nhttps://news.example/breach"}
                className={`${inputCls} font-mono text-xs`}
                data-testid="assistant-links-input"
              />
              <p className="text-[11px] text-[#8d90a0] mt-2 leading-relaxed">
                The assistant reads these pages before answering. Use them for incidents newer than the model's
                training data — up to four links.
              </p>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
