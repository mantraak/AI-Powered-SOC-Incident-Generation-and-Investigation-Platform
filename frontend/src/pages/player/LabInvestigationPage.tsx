import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, Badge, SeverityBadge, Spinner, EmptyState } from "../../components/ui";
import api from "../../api/client";
import type { Lab, Question, PlayerAnswer, Score } from "../../types";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Event { id: number; event_type: string; source: string; host: string; user: string; message: string; mitre_id?: string; timestamp?: string; }
interface Artifact { id: number; name: string; artifact_type: string; host: string; content: string; }
interface Alert { id: number; title: string; severity: string; description: string; mitre_id?: string; rule_name?: string; }
interface Indicator { id: number; ioc_type: string; value: string; description: string; mitre_id?: string; }
interface ContainmentOption { id: number; action_type: string; target: string; description: string; }

type Tab = "briefing" | "events" | "artifacts" | "alerts" | "indicators" | "questions" | "containment" | "score";

// ─── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ id, active, label, onClick }: { id: Tab; active: Tab; label: string; onClick: (t: Tab) => void }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active === id ? "border-cyan-500 text-cyan-400" : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
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
  const [containmentResult, setContainmentResult] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const labRes = await api.get(`/labs/${labId}`);
      const labData: Lab = labRes.data;
      setLab(labData);

      const scenarioRes = await api.get(`/scenarios/${labData.scenario_id}`);
      setScenario(scenarioRes.data);

      const sid = labData.scenario_id;
      const [evRes, arRes, alRes, inRes, qRes, caRes] = await Promise.all([
        api.get(`/investigation/scenarios/${sid}/events`),
        api.get(`/investigation/scenarios/${sid}/artifacts`),
        api.get(`/investigation/scenarios/${sid}/alerts`),
        api.get(`/investigation/scenarios/${sid}/indicators`),
        api.get(`/investigation/scenarios/${sid}/questions`),
        api.get(`/investigation/scenarios/${sid}/containment-actions`),
      ]);
      setEvents(evRes.data);
      setArtifacts(arRes.data);
      setAlerts(alRes.data);
      setIndicators(inRes.data);
      setQuestions(qRes.data);
      setContainmentOptions(caRes.data);

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
      const res = await api.post(`/labs/${labId}/submit`);
      await load();
      setTab("score");
    } catch (e: any) {
      alert(e.response?.data?.detail || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEvents = events.filter((e) =>
    !eventFilter || e.message?.toLowerCase().includes(eventFilter.toLowerCase()) ||
    e.host?.toLowerCase().includes(eventFilter.toLowerCase()) ||
    e.event_type?.toLowerCase().includes(eventFilter.toLowerCase())
  );

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!lab || !scenario) return <AppLayout><div className="p-6 text-red-400">Lab not found.</div></AppLayout>;

  const isEvaluated = lab.status === "evaluated";
  const isInProgress = lab.status === "in_progress";

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader
          title={scenario.title}
          subtitle={`Lab #${lab.id} · ${scenario.difficulty} · ${isEvaluated ? "Evaluated" : lab.status}`}
          action={
            lab.status === "assigned" ? (
              <Button onClick={startLab}>▶ Start Lab</Button>
            ) : isInProgress ? (
              <Button variant="success" onClick={submitLab} disabled={submitting}>
                {submitting ? "Submitting..." : "📤 Submit Lab"}
              </Button>
            ) : null
          }
        />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#21262d] mb-6 overflow-x-auto">
          {([
            ["briefing", "📋 Briefing"],
            ["alerts", `🚨 Alerts (${alerts.length})`],
            ["events", `📊 Events (${events.length})`],
            ["indicators", `🔍 IOCs (${indicators.length})`],
            ["artifacts", `🗂 Artifacts (${artifacts.length})`],
            ["questions", `❓ Questions (${questions.length})`],
            ["containment", "🛡 Containment"],
            ...(isEvaluated ? [["score", "🏆 Score"] as [Tab, string]] : []),
          ] as [Tab, string][]).map(([t, label]) => (
            <TabBtn key={t} id={t} active={tab} label={label} onClick={setTab} />
          ))}
        </div>

        {/* ── Briefing ── */}
        {tab === "briefing" && (
          <div className="space-y-4 max-w-3xl">
            <Card>
              <h2 className="text-sm font-semibold text-cyan-400 mb-3">📋 Incident Summary</h2>
              <p className="text-sm text-[#e6edf3] leading-relaxed">{scenario.summary || scenario.description || "No summary available."}</p>
            </Card>
            {scenario.assets?.length > 0 && (
              <Card>
                <h2 className="text-sm font-semibold text-cyan-400 mb-3">🖥 Affected Assets</h2>
                <div className="space-y-2">
                  {scenario.assets.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <span className="text-[#8b949e] w-28 shrink-0">{a.type || "asset"}</span>
                      <span className="text-[#e6edf3] font-mono">{a.name}</span>
                      <span className="text-[#8b949e]">{a.os} · {a.role}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {scenario.mitre_techniques?.length > 0 && (
              <Card>
                <h2 className="text-sm font-semibold text-cyan-400 mb-3">🎯 MITRE ATT&CK Techniques</h2>
                <div className="flex flex-wrap gap-2">
                  {scenario.mitre_techniques.map((t: string) => (
                    <Badge key={t} color="purple">{t}</Badge>
                  ))}
                </div>
              </Card>
            )}
            {lab.status === "assigned" && (
              <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                <p className="text-sm text-yellow-300">⚡ Click <strong>Start Lab</strong> in the top right to begin the investigation.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Alerts ── */}
        {tab === "alerts" && (
          alerts.length === 0 ? <EmptyState icon="🚨" title="No alerts generated" description="Generate the scenario first." /> : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <Card key={a.id}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[#e6edf3]">{a.title}</span>
                        <SeverityBadge severity={a.severity} />
                        {a.mitre_id && <Badge color="purple">{a.mitre_id}</Badge>}
                      </div>
                      <p className="text-sm text-[#8b949e]">{a.description}</p>
                      {a.rule_name && <p className="text-xs text-[#484f58] mt-1 font-mono">Rule: {a.rule_name}</p>}
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
              <input
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                placeholder="Filter events by message, host, or type…"
                className="w-full max-w-md bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
              />
            </div>
            {filteredEvents.length === 0 ? (
              <EmptyState icon="📊" title="No events" description={events.length === 0 ? "Generate the scenario first." : "No events match your filter."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#21262d] text-[#8b949e]">
                      <th className="text-left py-2 pr-4 font-medium">Timestamp</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-left py-2 pr-4 font-medium">Host</th>
                      <th className="text-left py-2 pr-4 font-medium">User</th>
                      <th className="text-left py-2 pr-4 font-medium">MITRE</th>
                      <th className="text-left py-2 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((e) => (
                      <tr key={e.id} className="border-b border-[#21262d]/50 hover:bg-[#161b22]">
                        <td className="py-1.5 pr-4 font-mono text-[#484f58] whitespace-nowrap">
                          {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                        </td>
                        <td className="py-1.5 pr-4 text-cyan-400 whitespace-nowrap">{e.event_type}</td>
                        <td className="py-1.5 pr-4 font-mono text-[#e6edf3]">{e.host}</td>
                        <td className="py-1.5 pr-4 text-[#8b949e]">{e.user}</td>
                        <td className="py-1.5 pr-4">{e.mitre_id ? <Badge color="purple">{e.mitre_id}</Badge> : "—"}</td>
                        <td className="py-1.5 text-[#8b949e] max-w-xs truncate">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Indicators ── */}
        {tab === "indicators" && (
          indicators.length === 0 ? <EmptyState icon="🔍" title="No IOCs" description="Generate the scenario first." /> : (
            <div className="space-y-2">
              {indicators.map((i) => (
                <Card key={i.id}>
                  <div className="flex items-center gap-4">
                    <Badge color="blue">{i.ioc_type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm text-cyan-300">{i.value}</span>
                    <span className="text-sm text-[#8b949e] flex-1">{i.description}</span>
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
                <EmptyState icon="🗂" title="No artifacts" description="Generate the scenario first." />
              ) : artifacts.map((a) => (
                <Card
                  key={a.id}
                  className={`cursor-pointer hover:border-cyan-700 transition-colors ${selectedArtifact?.id === a.id ? "border-cyan-600" : ""}`}
                >
                  <div onClick={() => setSelectedArtifact(a)}>
                    <p className="text-sm font-medium text-[#e6edf3]">{a.name}</p>
                    <p className="text-xs text-[#8b949e] mt-1">{a.artifact_type} · {a.host}</p>
                  </div>
                </Card>
              ))}
            </div>
            <div className="lg:col-span-2">
              {selectedArtifact ? (
                <Card>
                  <h3 className="text-sm font-semibold text-cyan-400 mb-3">{selectedArtifact.name}</h3>
                  <pre className="text-xs text-[#e6edf3] bg-[#0d1117] rounded p-4 overflow-auto max-h-96 whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedArtifact.content}
                  </pre>
                </Card>
              ) : (
                <div className="flex items-center justify-center h-32 text-[#8b949e] text-sm">
                  Select an artifact to view its contents
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Questions ── */}
        {tab === "questions" && (
          questions.length === 0 ? (
            <EmptyState icon="❓" title="No questions" description="Generate the scenario first." />
          ) : (
            <div className="space-y-6 max-w-3xl">
              {questions.map((q) => {
                const fb = answerFeedback[q.id];
                const answered = !!fb;
                return (
                  <Card key={q.id}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xs text-[#8b949e] font-medium uppercase tracking-wide">Q{q.order}</span>
                        <Badge color="gray" className="ml-2">{q.points} pts</Badge>
                      </div>
                      {answered && (
                        <Badge color={fb.is_correct ? "green" : "red"}>
                          {fb.is_correct ? `✓ +${fb.points_awarded}` : `✗ +${fb.points_awarded}`}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-[#e6edf3] mb-3">{q.question_text}</p>

                    {q.question_type === "multiple_choice" && q.choices?.length > 0 ? (
                      <div className="space-y-2 mb-3">
                        {q.choices.map((choice: string, ci: number) => (
                          <label key={ci} className="flex items-center gap-3 cursor-pointer group">
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={choice}
                              checked={answers[q.id] === choice}
                              onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: choice }))}
                              disabled={isEvaluated}
                              className="accent-cyan-500"
                            />
                            <span className="text-sm text-[#8b949e] group-hover:text-[#e6edf3]">{choice}</span>
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
                        className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500 mb-3 resize-none"
                      />
                    )}

                    {!isEvaluated && isInProgress && (
                      <Button size="sm" variant="secondary" onClick={() => submitAnswer(q.id)}>
                        Save Answer
                      </Button>
                    )}

                    {fb && (
                      <div className={`mt-3 p-2 rounded text-xs ${fb.is_correct ? "bg-green-900/20 border border-green-800 text-green-300" : "bg-red-900/20 border border-red-800 text-red-300"}`}>
                        {fb.feedback}
                      </div>
                    )}
                  </Card>
                );
              })}

              {isInProgress && (
                <Button variant="success" onClick={submitLab} disabled={submitting} className="w-full">
                  {submitting ? "Submitting…" : "📤 Submit All Answers"}
                </Button>
              )}
            </div>
          )
        )}

        {/* ── Containment ── */}
        {tab === "containment" && (
          <div className="max-w-2xl space-y-4">
            <div className="p-3 bg-cyan-900/20 border border-cyan-800 rounded-lg text-sm text-cyan-300">
              Select the appropriate containment actions for this incident. Wrong actions may impact your score.
            </div>
            {containmentOptions.length === 0 ? (
              <EmptyState icon="🛡" title="No containment actions" description="Generate the scenario first." />
            ) : (
              containmentOptions.map((ca) => (
                <Card key={ca.id} className={`cursor-pointer transition-colors ${selectedContainment.has(ca.id) ? "border-cyan-600 bg-cyan-900/10" : "hover:border-[#30363d]"}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedContainment.has(ca.id)}
                      onChange={() => {
                        setSelectedContainment((prev) => {
                          const next = new Set(prev);
                          next.has(ca.id) ? next.delete(ca.id) : next.add(ca.id);
                          return next;
                        });
                      }}
                      disabled={isEvaluated}
                      className="mt-0.5 accent-cyan-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#e6edf3]">
                        <span className="font-mono text-cyan-400 mr-2">[{ca.action_type}]</span>
                        {ca.target}
                      </p>
                      <p className="text-xs text-[#8b949e] mt-0.5">{ca.description}</p>
                    </div>
                  </label>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ── Score ── */}
        {tab === "score" && (
          score ? (
            <div className="max-w-xl space-y-4">
              <Card>
                <div className="text-center py-4">
                  <div className="text-6xl font-bold text-cyan-400 mb-2">{score.grade || "—"}</div>
                  <div className="text-2xl font-semibold text-[#e6edf3]">{score.total_score} / {score.max_possible} pts</div>
                  <div className="text-sm text-[#8b949e] mt-1">
                    {score.max_possible > 0 ? ((score.total_score / score.max_possible) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </Card>
              {score.feedback && (
                <Card>
                  <h3 className="text-sm font-semibold text-cyan-400 mb-2">Feedback</h3>
                  <p className="text-sm text-[#8b949e]">{score.feedback}</p>
                </Card>
              )}
              <Card>
                <h3 className="text-sm font-semibold text-cyan-400 mb-3">Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-[#8b949e]">Investigation Questions</span><span className="text-[#e6edf3]">{score.question_score} pts</span></div>
                  <div className="flex justify-between"><span className="text-[#8b949e]">Containment Actions</span><span className="text-[#e6edf3]">{score.containment_score} pts</span></div>
                  <div className="flex justify-between border-t border-[#21262d] pt-2 font-semibold"><span className="text-[#e6edf3]">Total</span><span className="text-cyan-400">{score.total_score} pts</span></div>
                </div>
              </Card>
            </div>
          ) : (
            <EmptyState icon="🏆" title="Score not available yet" description="Submit the lab to see your score." />
          )
        )}
      </div>
    </AppLayout>
  );
}
