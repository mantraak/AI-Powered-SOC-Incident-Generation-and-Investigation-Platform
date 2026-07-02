import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, Badge, SeverityBadge, Spinner, EmptyState, Icon } from "../../components/ui";
import api from "../../api/client";
import type { Lab, Question, PlayerAnswer, Score } from "../../types";

interface Event { id: number; event_type: string; source: string; host: string; user: string; message: string; mitre_id?: string; timestamp?: string; }
interface Artifact { id: number; name: string; artifact_type: string; host: string; content: string; }
interface Alert { id: number; title: string; severity: string; description: string; mitre_id?: string; rule_name?: string; }
interface Indicator { id: number; ioc_type: string; value: string; description: string; mitre_id?: string; }
interface ContainmentOption { id: number; action_type: string; target: string; description: string; }
interface TrafficFlow { id: number; src_ip: string; dst_ip: string; src_port?: number; dst_port?: number; protocol: string; packets: number; bytes: number; direction?: string; summary?: string; mitre_id?: string; is_malicious: boolean; timestamp?: string; }
interface Trace { id: number; trace_type: string; host: string; process_name?: string; parent_process?: string; command_line?: string; network_target?: string; summary?: string; mitre_id?: string; is_malicious: boolean; timestamp?: string; }
interface Workspace { workspace_id: string; status: string; required_tools: string[]; detail?: string; tools: Record<string, { username: string; password: string; url: string; tenant?: string; index?: string }>; }

type Tab = "briefing" | "tools" | "events" | "traffic" | "traces" | "artifacts" | "alerts" | "indicators" | "questions" | "containment" | "score";

/* ════════════════════════ Tab button ════════════════════════ */
function TabBtn({
  id, active, label, icon, count, onClick,
}: {
  id: Tab; active: Tab; label: string; icon: string; count?: number;
  onClick: (t: Tab) => void;
}) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      data-testid={`lab-tab-${id}`}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-2 ${
        isActive
          ? "border-[#b4c5ff] text-[#b4c5ff]"
          : "border-transparent text-[#8d90a0] hover:text-[#e1e2ed]"
      }`}
    >
      <Icon name={icon} className="text-base" />
      {label}
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
          isActive ? "bg-[#2563eb]/25 text-[#b4c5ff]" : "bg-[#32343d] text-[#c3c6d7]"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

const inputCls =
  "w-full bg-[#0c0e16] border border-[#434655] rounded-[10px] px-3 py-2 text-sm text-[#e1e2ed] placeholder-[#8d90a0] focus:outline-none focus:border-[#b4c5ff] focus:ring-2 focus:ring-[#b4c5ff]/20 transition-colors";

export function LabInvestigationPage() {
  const { id } = useParams<{ id: string }>();
  const labId = parseInt(id!);
  const navigate = useNavigate();

  const [lab, setLab] = useState<Lab | null>(null);
  const [scenario, setScenario] = useState<any>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [traffic, setTraffic] = useState<TrafficFlow[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [containmentOptions, setContainmentOptions] = useState<ContainmentOption[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<PlayerAnswer[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [tab, setTab] = useState<Tab>("briefing");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState<Record<number, PlayerAnswer>>({});
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [eventFilter, setEventFilter] = useState("");
  const [selectedContainment, setSelectedContainment] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const labRes = await api.get(`/labs/${labId}`);
      const labData: Lab = labRes.data;
      setLab(labData);

      const scenarioRes = await api.get(`/scenarios/${labData.scenario_id}`);
      setScenario(scenarioRes.data);

      const sid = labData.scenario_id;
      const [evRes, trafficRes, tracesRes, arRes, alRes, inRes, qRes, caRes] = await Promise.all([
        api.get(`/investigation/scenarios/${sid}/events`),
        api.get(`/investigation/scenarios/${sid}/traffic`),
        api.get(`/investigation/scenarios/${sid}/traces`),
        api.get(`/investigation/scenarios/${sid}/artifacts`),
        api.get(`/investigation/scenarios/${sid}/alerts`),
        api.get(`/investigation/scenarios/${sid}/indicators`),
        api.get(`/investigation/scenarios/${sid}/questions`),
        api.get(`/investigation/scenarios/${sid}/containment-actions`),
      ]);
      setEvents(evRes.data);
      setTraffic(trafficRes.data);
      setTraces(tracesRes.data);
      setArtifacts(arRes.data);
      setAlerts(alRes.data);
      setIndicators(inRes.data);
      setQuestions(qRes.data);
      setContainmentOptions(caRes.data);
      try {
        const workspaceRes = await api.get(`/labs/${labId}/workspace`);
        setWorkspace(workspaceRes.data);
      } catch (workspaceError) {
        console.error(workspaceError);
      }

      if (labData.status === "evaluated") {
        const [answersRes, scoreRes] = await Promise.all([
          api.get(`/labs/${labId}/answers`),
          api.get(`/labs/${labId}/score`),
        ]);
        const fb: Record<number, PlayerAnswer> = {};
        for (const a of answersRes.data) fb[a.question_id] = a;
        setAnswerFeedback(fb);
        setSubmittedAnswers(answersRes.data);
        setScore(scoreRes.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  const startLab = async () => {
    await api.post(`/labs/${labId}/start`);
    setLab((prev) => prev ? { ...prev, status: "in_progress" } : prev);
  };

  const submitAnswer = async (questionId: number) => {
    const text = answers[questionId];
    if (!text?.trim()) return;
    try {
      const res = await api.post(`/labs/${labId}/answer`, {
        question_id: questionId,
        lab_id: labId,
        answer_text: text,
      });
      setAnswerFeedback((prev) => ({ ...prev, [questionId]: res.data }));
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to submit answer");
    }
  };

  const submitLab = async () => {
    if (!confirm("Submit this lab? You will not be able to change your answers after submission.")) return;
    setSubmitting(true);
    try {
      await api.post(`/labs/${labId}/submit`);
      await load();
      setTab("score");
    } catch (e: any) {
      alert(e.response?.data?.detail || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEvents = events.filter((e) =>
    !eventFilter ||
    e.message?.toLowerCase().includes(eventFilter.toLowerCase()) ||
    e.host?.toLowerCase().includes(eventFilter.toLowerCase()) ||
    e.event_type?.toLowerCase().includes(eventFilter.toLowerCase())
  );

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!lab || !scenario) return <AppLayout><div className="p-6 text-[#ffb4ab]">Lab not found.</div></AppLayout>;

  const isEvaluated = lab.status === "evaluated";
  const isInProgress = lab.status === "in_progress";

  const tabConfig: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: "briefing",    label: "Briefing",    icon: "menu_book"        },
    { key: "tools",       label: "Lab Tools",   icon: "construction", count: workspace ? Object.keys(workspace.tools).length : 0 },
    { key: "alerts",      label: "Alerts",      icon: "notifications_active", count: alerts.length     },
    { key: "events",      label: "Events",      icon: "monitor_heart",        count: events.length     },
    { key: "traffic",     label: "Traffic",     icon: "lan",                  count: traffic.length    },
    { key: "traces",      label: "Traces",      icon: "account_tree",         count: traces.length     },
    { key: "indicators",  label: "IOCs",        icon: "fingerprint",          count: indicators.length },
    { key: "artifacts",   label: "Artifacts",   icon: "folder_zip",           count: artifacts.length  },
    { key: "questions",   label: "Questions",   icon: "quiz",                 count: questions.length  },
    { key: "containment", label: "Containment", icon: "shield"                                          },
    ...(isEvaluated ? [{ key: "score" as Tab, label: "Score", icon: "emoji_events" }] : []),
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title={scenario.title}
          subtitle={`Lab #${lab.id} · ${scenario.difficulty} · ${isEvaluated ? "Evaluated" : lab.status}`}
          action={
            lab.status === "assigned" ? (
              <Button onClick={startLab} data-testid="start-lab-btn">
                <Icon name="play_arrow" className="text-base" />
                Start Lab
              </Button>
            ) : isInProgress ? (
              <Button variant="success" onClick={submitLab} disabled={submitting} data-testid="submit-lab-btn">
                <Icon name="send" className="text-base" />
                {submitting ? "Submitting…" : "Submit Lab"}
              </Button>
            ) : null
          }
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#434655] mb-6 overflow-x-auto">
          {tabConfig.map((t) => (
            <TabBtn key={t.key} id={t.key} active={tab} label={t.label} icon={t.icon} count={t.count} onClick={setTab} />
          ))}
        </div>

        {/* ── Briefing ── */}
        {tab === "briefing" && (
          <div className="space-y-4 max-w-4xl">
            <Card>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#434655]">
                <Icon name="menu_book" className="text-[#b4c5ff]" />
                <h2 className="text-sm font-semibold text-[#e1e2ed]">Incident Summary</h2>
              </div>
              <p className="text-sm text-[#c3c6d7] leading-relaxed">
                {scenario.summary || scenario.description || "No summary available."}
              </p>
            </Card>

            {scenario.assets?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#434655]">
                  <Icon name="dns" className="text-[#b4c5ff]" />
                  <h2 className="text-sm font-semibold text-[#e1e2ed]">Affected Assets</h2>
                </div>
                <div className="space-y-2">
                  {scenario.assets.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1.5">
                      <Badge color="gray">{a.type || "asset"}</Badge>
                      <span className="text-[#e1e2ed] font-mono">{a.name}</span>
                      <span className="text-[#8d90a0]">{a.os} · {a.role}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {scenario.mitre_techniques?.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#434655]">
                  <Icon name="target" className="text-[#b4c5ff]" />
                  <h2 className="text-sm font-semibold text-[#e1e2ed]">MITRE ATT&amp;CK Techniques</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {scenario.mitre_techniques.map((t: string) => (
                    <Badge key={t} color="purple">{t}</Badge>
                  ))}
                </div>
              </Card>
            )}

            {lab.status === "assigned" && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-[14px] flex items-start gap-3">
                <Icon name="bolt" filled className="text-amber-300 text-xl flex-shrink-0" />
                <p className="text-sm text-amber-200">
                  Click <strong>Start Lab</strong> in the top right to begin the investigation.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Alerts ── */}
        {tab === "tools" && (
          !workspace ? <EmptyState icon="construction" title="Workspace unavailable" description="The isolated lab workspace is still being prepared." /> : (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-[#8d90a0] uppercase tracking-wider">Isolated workspace</p><p className="text-lg font-mono text-[#b4c5ff] mt-1">{workspace.workspace_id}</p></div><Badge color={workspace.status === "ready" ? "green" : "yellow"}>{workspace.status}</Badge></div>
                <p className="text-xs text-[#8d90a0] mt-3">Evidence, saved searches, answers and scores are scoped to this assignment and cannot be accessed by another player.</p>
                {workspace.detail && <p className="text-xs text-[#ffb4ab] mt-2">{workspace.detail}</p>}
              </Card>
              {Object.entries(workspace.tools).map(([name, tool]) => (
                <Card key={name}>
                  <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Icon name="shield_lock" className="text-[#b4c5ff]" /><h3 className="font-semibold text-[#e1e2ed] capitalize">{name}</h3></div><p className="text-xs text-[#8d90a0] mt-1">Dedicated tenant credentials for this lab only</p></div><Button onClick={() => window.open(tool.url, '_blank', 'noopener,noreferrer')}><Icon name="open_in_new" className="text-base" /> Open {name}</Button></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 p-3 rounded-lg bg-[#0c0e16] border border-[#434655] text-xs font-mono"><p className="text-[#8d90a0]">Username<br/><span className="text-[#b4c5ff] select-all">{tool.username}</span></p><p className="text-[#8d90a0]">Password<br/><span className="text-[#6ee7b7] select-all break-all">{tool.password}</span></p>{tool.index && <p className="text-[#8d90a0] md:col-span-2">Evidence index<br/><span className="text-[#c3c6d7] select-all">{tool.index}</span></p>}</div>
                </Card>
              ))}
            </div>
          )
        )}

        {tab === "alerts" && (
          alerts.length === 0
            ? <EmptyState icon="notifications_active" title="No alerts generated" description="Generate the scenario first." />
            : (
              <div className="space-y-3">
                {alerts.map((a) => (
                  <Card key={a.id}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#93000a]/20 border border-[#93000a]/40 flex items-center justify-center flex-shrink-0">
                        <Icon name="notifications_active" filled className="text-[#ffb4ab]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold text-[#e1e2ed]">{a.title}</span>
                          <SeverityBadge severity={a.severity} />
                          {a.mitre_id && <Badge color="purple">{a.mitre_id}</Badge>}
                        </div>
                        <p className="text-sm text-[#c3c6d7]">{a.description}</p>
                        {a.rule_name && <p className="text-xs text-[#8d90a0] mt-1.5 font-mono">Rule: {a.rule_name}</p>}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
        )}

        {/* ── Events ── */}
        {tab === "events" && (
          <div>
            <div className="mb-4">
              <div className="relative max-w-md">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8d90a0]" />
                <input
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  placeholder="Filter events by message, host, or type…"
                  className={`${inputCls} pl-10`}
                  data-testid="events-filter-input"
                />
              </div>
            </div>
            {filteredEvents.length === 0 ? (
              <EmptyState
                icon="monitor_heart"
                title="No events"
                description={events.length === 0 ? "Generate the scenario first." : "No events match your filter."}
              />
            ) : (
              <Card className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#0c0e16] border-b border-[#434655] text-[#8d90a0]">
                        <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">Timestamp</th>
                        <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">Type</th>
                        <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">Host</th>
                        <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">User</th>
                        <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">MITRE</th>
                        <th className="text-left py-3 px-4 font-semibold uppercase tracking-wider">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((e) => (
                        <tr key={e.id} className="border-b border-[#434655]/50 hover:bg-[#282a32]/40 transition-colors">
                          <td className="py-2 px-4 font-mono text-[#8d90a0] whitespace-nowrap">
                            {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                          </td>
                          <td className="py-2 px-4 text-[#b4c5ff] whitespace-nowrap">{e.event_type}</td>
                          <td className="py-2 px-4 font-mono text-[#e1e2ed]">{e.host}</td>
                          <td className="py-2 px-4 text-[#c3c6d7]">{e.user}</td>
                          <td className="py-2 px-4">{e.mitre_id ? <Badge color="purple">{e.mitre_id}</Badge> : "—"}</td>
                          <td className="py-2 px-4 text-[#c3c6d7] max-w-xs truncate">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Indicators ── */}
        {tab === "traffic" && (
          traffic.length === 0 ? <EmptyState icon="lan" title="No network traffic" description="Generate the scenario to create synthetic flow records." /> : (
            <Card className="p-0 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-xs">
              <thead><tr className="bg-[#0c0e16] border-b border-[#434655] text-[#8d90a0]">{['Time', 'Source', 'Destination', 'Protocol', 'Packets', 'Bytes', 'Finding'].map((h) => <th key={h} className="text-left py-3 px-4 font-semibold uppercase tracking-wider">{h}</th>)}</tr></thead>
              <tbody>{traffic.map((flow) => <tr key={flow.id} className="border-b border-[#434655]/50 last:border-0">
                <td className="py-3 px-4 text-[#8d90a0] font-mono">{flow.timestamp ? new Date(flow.timestamp).toLocaleTimeString() : '-'}</td>
                <td className="py-3 px-4 text-[#c3c6d7] font-mono">{flow.src_ip}:{flow.src_port || '*'}</td>
                <td className="py-3 px-4 text-[#b4c5ff] font-mono">{flow.dst_ip}:{flow.dst_port || '*'}</td>
                <td className="py-3 px-4"><Badge color="gray">{flow.protocol}</Badge></td><td className="py-3 px-4 font-mono">{flow.packets}</td><td className="py-3 px-4 font-mono">{flow.bytes}</td>
                <td className="py-3 px-4"><span className={flow.is_malicious ? "text-[#ffb4ab]" : "text-[#6ee7b7]"}>{flow.summary || (flow.is_malicious ? 'Suspicious' : 'Normal')}</span>{flow.mitre_id && <div className="mt-1"><Badge color="purple">{flow.mitre_id}</Badge></div>}</td>
              </tr>)}</tbody>
            </table></div></Card>
          )
        )}

        {tab === "traces" && (
          traces.length === 0 ? <EmptyState icon="account_tree" title="No execution traces" description="Generate the scenario to create correlated traces." /> : (
            <div className="space-y-3">{traces.map((trace) => <Card key={trace.id} className={trace.is_malicious ? "border-[#93000a]/50" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 mb-2"><Icon name="account_tree" className="text-[#b4c5ff]" /><span className="font-semibold text-[#e1e2ed]">{trace.host} · {trace.trace_type}</span>{trace.mitre_id && <Badge color="purple">{trace.mitre_id}</Badge>}</div><p className="text-sm text-[#c3c6d7]">{trace.summary}</p></div><Badge color={trace.is_malicious ? "red" : "green"}>{trace.is_malicious ? "suspicious" : "normal"}</Badge></div>
              <div className="mt-3 p-3 rounded-lg bg-[#0c0e16] border border-[#434655] text-xs font-mono text-[#8d90a0] space-y-1"><p>parent: <span className="text-[#c3c6d7]">{trace.parent_process || '-'}</span> → process: <span className="text-[#e1e2ed]">{trace.process_name || '-'}</span></p>{trace.command_line && <p>command: <span className="text-[#c3c6d7]">{trace.command_line}</span></p>}{trace.network_target && <p>target: <span className="text-[#b4c5ff]">{trace.network_target}</span></p>}</div>
            </Card>)}</div>
          )
        )}

        {tab === "indicators" && (
          indicators.length === 0
            ? <EmptyState icon="fingerprint" title="No IOCs" description="Generate the scenario first." />
            : (
              <div className="space-y-2">
                {indicators.map((i) => (
                  <Card key={i.id}>
                    <div className="flex items-center gap-4 flex-wrap">
                      <Badge color="blue">{i.ioc_type.toUpperCase()}</Badge>
                      <span className="font-mono text-sm text-[#b4c5ff]">{i.value}</span>
                      <span className="text-sm text-[#c3c6d7] flex-1">{i.description}</span>
                      {i.mitre_id && <Badge color="purple">{i.mitre_id}</Badge>}
                    </div>
                  </Card>
                ))}
              </div>
            )
        )}

        {/* ── Artifacts ── */}
        {tab === "artifacts" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              {artifacts.length === 0 ? (
                <EmptyState icon="folder_zip" title="No artifacts" description="Generate the scenario first." />
              ) : artifacts.map((a) => (
                <Card
                  key={a.id}
                  className={`cursor-pointer hover:border-[#b4c5ff]/40 transition-all ${
                    selectedArtifact?.id === a.id ? "border-[#b4c5ff] bg-[#2563eb]/10" : ""
                  }`}
                >
                  <div onClick={() => setSelectedArtifact(a)} className="flex items-center gap-2.5">
                    <Icon name="description" className="text-[#b4c5ff] text-lg" />
                    <div>
                      <p className="text-sm font-medium text-[#e1e2ed]">{a.name}</p>
                      <p className="text-xs text-[#8d90a0] mt-0.5">{a.artifact_type} · {a.host}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <div className="lg:col-span-2">
              {selectedArtifact ? (
                <Card>
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#434655]">
                    <Icon name="description" className="text-[#b4c5ff]" />
                    <h3 className="text-sm font-semibold text-[#e1e2ed]">{selectedArtifact.name}</h3>
                  </div>
                  <pre className="text-xs text-[#e1e2ed] bg-[#0c0e16] border border-[#434655] rounded-lg p-4 overflow-auto max-h-[28rem] whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedArtifact.content}
                  </pre>
                </Card>
              ) : (
                <Card className="flex items-center justify-center h-40 text-[#8d90a0] text-sm">
                  Select an artifact to view its contents
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── Questions ── */}
        {tab === "questions" && (
          questions.length === 0
            ? <EmptyState icon="quiz" title="No questions" description="Generate the scenario first." />
            : (
              <div className="space-y-6 max-w-3xl">
                {questions.map((q) => {
                  const fb = answerFeedback[q.id];
                  const answered = !!fb;
                  return (
                    <Card key={q.id}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8d90a0] font-bold uppercase tracking-wider">Q{q.order}</span>
                          <Badge color="gray">{q.points} pts</Badge>
                        </div>
                        {answered && (
                          <Badge color={fb.is_correct ? "green" : "red"}>
                            <Icon name={fb.is_correct ? "check_circle" : "cancel"} className="text-xs" />
                            +{fb.points_awarded}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-[#e1e2ed] mb-3 leading-relaxed">{q.question_text}</p>

                      {q.question_type === "multiple_choice" && q.choices?.length > 0 ? (
                        <div className="space-y-2 mb-3">
                          {q.choices.map((choice: string, ci: number) => (
                            <label key={ci} className="flex items-center gap-3 cursor-pointer group p-2 rounded-md hover:bg-[#282a32] transition-colors">
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                value={choice}
                                checked={answers[q.id] === choice}
                                onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: choice }))}
                                disabled={isEvaluated}
                                className="accent-[#b4c5ff]"
                              />
                              <span className="text-sm text-[#c3c6d7] group-hover:text-[#e1e2ed]">{choice}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          value={answers[q.id] || ""}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          disabled={isEvaluated}
                          placeholder={q.hint || "Your answer…"}
                          rows={3}
                          className={`${inputCls} mb-3 resize-none`}
                        />
                      )}

                      {!isEvaluated && isInProgress && (
                        <Button size="sm" variant="secondary" onClick={() => submitAnswer(q.id)}>
                          <Icon name="save" className="text-base" />
                          Save Answer
                        </Button>
                      )}

                      {fb && (
                        <div
                          className={`mt-3 p-3 rounded-md text-xs flex items-start gap-2 ${
                            fb.is_correct
                              ? "bg-emerald-500/10 border border-emerald-500/40 text-emerald-200"
                              : "bg-[#93000a]/20 border border-[#93000a]/50 text-[#ffb4ab]"
                          }`}
                        >
                          <Icon name={fb.is_correct ? "check_circle" : "cancel"} filled className="text-base flex-shrink-0 mt-0.5" />
                          <span>{fb.feedback}</span>
                        </div>
                      )}
                    </Card>
                  );
                })}

                {isInProgress && (
                  <Button variant="success" onClick={submitLab} disabled={submitting} className="w-full" data-testid="submit-all-answers-btn">
                    <Icon name="send" className="text-base" />
                    {submitting ? "Submitting…" : "Submit All Answers"}
                  </Button>
                )}
              </div>
            )
        )}

        {/* ── Containment ── */}
        {tab === "containment" && (
          <div className="max-w-2xl space-y-4">
            <div className="p-3 bg-[#2563eb]/10 border border-[#2563eb]/40 rounded-lg text-sm text-[#b4c5ff] flex items-start gap-2">
              <Icon name="shield" filled className="text-base flex-shrink-0 mt-0.5" />
              Select the appropriate containment actions for this incident. Wrong actions may impact your score.
            </div>
            {containmentOptions.length === 0 ? (
              <EmptyState icon="shield" title="No containment actions" description="Generate the scenario first." />
            ) : (
              containmentOptions.map((ca) => {
                const isSelected = selectedContainment.has(ca.id);
                return (
                  <Card
                    key={ca.id}
                    className={`cursor-pointer transition-all ${
                      isSelected ? "border-[#b4c5ff] bg-[#2563eb]/10" : "hover:border-[#b4c5ff]/30"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedContainment((prev) => {
                            const next = new Set(prev);
                            if (next.has(ca.id)) next.delete(ca.id);
                            else next.add(ca.id);
                            return next;
                          });
                        }}
                        disabled={isEvaluated}
                        className="mt-1 accent-[#b4c5ff] w-4 h-4"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#e1e2ed]">
                          <span className="font-mono text-[#b4c5ff] mr-2">[{ca.action_type}]</span>
                          {ca.target}
                        </p>
                        <p className="text-xs text-[#8d90a0] mt-0.5">{ca.description}</p>
                      </div>
                    </label>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* ── Score ── */}
        {tab === "score" && (
          score ? (
            <div className="max-w-xl space-y-4">
              <Card>
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#2563eb]/15 border border-[#2563eb]/40 mb-4">
                    <Icon name="emoji_events" filled className="text-4xl text-[#b4c5ff]" />
                  </div>
                  <div className="text-6xl font-bold text-[#b4c5ff] mb-2 tracking-tight">{score.grade || "—"}</div>
                  <div className="text-2xl font-semibold text-[#e1e2ed]">{score.total_score} / {score.max_possible} pts</div>
                  <div className="text-sm text-[#8d90a0] mt-1 font-mono">
                    {score.max_possible > 0 ? ((score.total_score / score.max_possible) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </Card>
              {score.feedback && (
                <Card>
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#434655]">
                    <Icon name="comment" className="text-[#b4c5ff]" />
                    <h3 className="text-sm font-semibold text-[#e1e2ed]">Feedback</h3>
                  </div>
                  <p className="text-sm text-[#c3c6d7] leading-relaxed">{score.feedback}</p>
                </Card>
              )}
              <Card>
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#434655]">
                  <Icon name="leaderboard" className="text-[#b4c5ff]" />
                  <h3 className="text-sm font-semibold text-[#e1e2ed]">Breakdown</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[#8d90a0]">Investigation Questions</span><span className="text-[#e1e2ed] font-mono">{score.question_score} pts</span></div>
                  <div className="flex justify-between"><span className="text-[#8d90a0]">Containment Actions</span><span className="text-[#e1e2ed] font-mono">{score.containment_score} pts</span></div>
                  <div className="flex justify-between border-t border-[#434655] pt-2 font-semibold">
                    <span className="text-[#e1e2ed]">Total</span>
                    <span className="text-[#b4c5ff] font-mono">{score.total_score} pts</span>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <EmptyState icon="emoji_events" title="Score not available yet" description="Submit the lab to see your score." />
          )
        )}
      </div>
    </AppLayout>
  );
}
