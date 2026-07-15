import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, DifficultyBadge, EmptyState, Icon, Spinner, StatusBadge } from "../../components/ui";
import api from "../../api/client";
import type { LabArchiveDetail, LabArchiveSummary } from "../../types";

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString();
}

function pctColor(percent: number) {
  if (percent >= 80) return "text-emerald-300";
  if (percent >= 55) return "text-amber-300";
  return "text-[#ffb4ab]";
}

function EvidenceCounters({ detail }: { detail: LabArchiveDetail }) {
  const counters = [
    { label: "Events", value: detail.evidence.events.length, icon: "event_list" },
    { label: "Traffic", value: detail.evidence.traffic.length, icon: "lan" },
    { label: "Traces", value: detail.evidence.traces.length, icon: "account_tree" },
    { label: "Artifacts", value: detail.evidence.artifacts.length, icon: "inventory_2" },
    { label: "Alerts", value: detail.evidence.alerts.length, icon: "notifications_active" },
    { label: "IOCs", value: detail.evidence.indicators.length, icon: "fingerprint" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {counters.map((item) => (
        <div key={item.label} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
          <div className="flex items-center justify-between">
            <Icon name={item.icon} className="text-[#9fb9ff]" />
            <span className="text-xl font-bold text-[#edf0fa]">{item.value}</span>
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-[#858b9d]">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function ArchiveDetailPanel({ detail }: { detail: LabArchiveDetail }) {
  const missed = detail.question_review.filter((q) => q.is_correct === false || !q.player_answer);
  const score = detail.summary.percent ?? 0;

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#356df3]/15 blur-3xl" />
        <div className="relative flex flex-col xl:flex-row xl:items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge color="primary">Lab #{detail.summary.lab_id}</Badge>
              <DifficultyBadge difficulty={detail.summary.difficulty} />
              <StatusBadge status={detail.summary.status} />
            </div>
            <h2 className="text-2xl font-bold text-[#edf0fa] tracking-tight">{detail.scenario.title}</h2>
            <p className="mt-2 text-sm text-[#a5a9b8] max-w-4xl">{detail.scenario.summary || detail.scenario.description || detail.diary.opening}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(detail.scenario.mitre_techniques || []).slice(0, 10).map((id) => (
                <Badge key={id} color="cyan">{id}</Badge>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.1] bg-[#0b0f18]/70 p-5 min-w-[220px]">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#858b9d]">Final score</p>
            <div className="mt-2 flex items-end gap-2">
              <span className={`text-5xl font-black tracking-tight ${pctColor(score)}`}>{score.toFixed(1)}</span>
              <span className="pb-2 text-[#858b9d]">%</span>
            </div>
            <p className="mt-2 text-sm text-[#c3c6d7]">
              Grade <span className="font-bold text-[#edf0fa]">{detail.score?.grade || "N/A"}</span>
              {" "}· {detail.summary.correct_answers}/{detail.summary.total_questions} correct
            </p>
          </div>
        </div>
      </Card>

      <EvidenceCounters detail={detail} />

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-5">
        <Card>
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
            <Icon name="auto_stories" className="text-[#b4c5ff]" />
            <h3 className="font-semibold text-[#e1e2ed]">Investigation diary</h3>
          </div>
          <div className="space-y-4 text-sm text-[#c3c6d7]">
            <p>{detail.diary.opening}</p>
            <p>{detail.diary.method}</p>
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-amber-100">
              <div className="flex gap-2">
                <Icon name="tips_and_updates" className="text-amber-300" />
                <p>{detail.diary.review_tip}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
            <Icon name="fact_check" className="text-[#b4c5ff]" />
            <h3 className="font-semibold text-[#e1e2ed]">Review priorities</h3>
          </div>
          {missed.length === 0 ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              Strong run. All answered questions were marked correct.
            </div>
          ) : (
            <div className="space-y-3">
              {missed.slice(0, 4).map((q) => (
                <div key={q.question_id} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <Badge color="yellow">Q{q.order}</Badge>
                    <span className="text-xs text-[#858b9d]">{q.points_awarded}/{q.points} pts</span>
                  </div>
                  <p className="text-sm text-[#e1e2ed] line-clamp-2">{q.question_text}</p>
                  <p className="mt-2 text-xs text-[#a5a9b8]">{q.feedback}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
          <Icon name="route" className="text-[#b4c5ff]" />
          <h3 className="font-semibold text-[#e1e2ed]">How you worked through the lab</h3>
        </div>
        {detail.investigation_path.length === 0 ? (
          <EmptyState icon="history_edu" title="No answer trail recorded" description="This lab was submitted without recorded question answers." />
        ) : (
          <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-1 before:bottom-1 before:w-px before:bg-white/[0.1]">
            {detail.investigation_path.map((step) => (
              <div key={`${step.step}-${step.title}`} className="relative">
                <span className={`absolute -left-[23px] top-1 h-4 w-4 rounded-full border-2 ${step.outcome === "correct" ? "bg-emerald-400 border-emerald-200" : "bg-amber-400 border-amber-200"}`} />
                <div className="rounded-2xl border border-white/[0.08] bg-[#0b0f18]/55 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <h4 className="font-semibold text-[#edf0fa]">{step.title}</h4>
                    <Badge color={step.outcome === "correct" ? "green" : "yellow"}>{step.outcome === "correct" ? "Correct" : "Review"}</Badge>
                  </div>
                  <p className="text-sm text-[#a5a9b8]">{step.description}</p>
                  <div className="mt-3 rounded-xl bg-black/25 border border-white/[0.06] p-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#858b9d] mb-1">Your answer</p>
                    <p className="text-sm text-[#e1e2ed] whitespace-pre-wrap">{step.player_action || "No answer text"}</p>
                  </div>
                  {step.feedback && <p className="mt-3 text-xs text-[#9fb9ff]">{step.feedback}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
            <Icon name="quiz" className="text-[#b4c5ff]" />
            <h3 className="font-semibold text-[#e1e2ed]">Question-by-question review</h3>
          </div>
          <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
            {detail.question_review.map((q) => (
              <div key={q.question_id} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <Badge color="primary">Q{q.order}</Badge>
                  <Badge color={q.is_correct ? "green" : q.player_answer ? "yellow" : "gray"}>
                    {q.is_correct ? "Correct" : q.player_answer ? "Needs review" : "Skipped"}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-[#edf0fa]">{q.question_text}</p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-[#858b9d]">Submitted answer</p>
                <p className="mt-1 text-sm text-[#c3c6d7] whitespace-pre-wrap">{q.player_answer || "No answer submitted."}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#858b9d]">
                  <span>{q.points_awarded}/{q.points} points</span>
                  {q.attached_evidence && <Badge color="cyan">Evidence: {q.attached_evidence}</Badge>}
                </div>
                {q.feedback && <p className="mt-3 text-xs text-[#9fb9ff]">{q.feedback}</p>}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
            <Icon name="travel_explore" className="text-[#b4c5ff]" />
            <h3 className="font-semibold text-[#e1e2ed]">Evidence refresher</h3>
          </div>
          <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
            {detail.key_findings.map((finding, idx) => (
              <div key={`${finding.type}-${idx}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge color={finding.type === "alert" ? "red" : "cyan"}>{finding.type}</Badge>
                  {finding.mitre_id && <Badge color="purple">{finding.mitre_id}</Badge>}
                  {finding.severity && <span className="text-xs text-[#858b9d]">{finding.severity}</span>}
                </div>
                <p className="font-semibold text-[#edf0fa]">{finding.title}</p>
                <p className="mt-1 text-sm text-[#a5a9b8]">{finding.detail}</p>
              </div>
            ))}
            {detail.evidence.traces.slice(0, 6).map((trace) => (
              <div key={`trace-${trace.id}`} className="rounded-2xl border border-white/[0.08] bg-[#0b0f18]/55 p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge color="gray">Trace</Badge>
                  {trace.mitre_id && <Badge color="purple">{trace.mitre_id}</Badge>}
                  {trace.is_malicious && <Badge color="red">Suspicious</Badge>}
                </div>
                <p className="font-mono text-sm text-[#edf0fa]">{trace.process_name || trace.trace_type}</p>
                <p className="mt-1 text-xs text-[#a5a9b8]">{trace.command_line || trace.summary}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function PlayerArchivePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState<LabArchiveSummary[]>([]);
  const [detail, setDetail] = useState<LabArchiveDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api.get<LabArchiveSummary[]>("/labs/archive")
      .then((res) => {
        setItems(res.data);
        if (!id && res.data.length > 0) navigate(`/player/archive/${res.data[0].lab_id}`, { replace: true });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api.get<LabArchiveDetail>(`/labs/archive/${id}`)
      .then((res) => setDetail(res.data))
      .finally(() => setDetailLoading(false));
  }, [id]);

  const selectedId = useMemo(() => Number(id), [id]);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
        <PageHeader
          title="Archive"
          subtitle="A personal after-action diary of completed labs, answers, evidence, feedback and investigation flow."
          action={
            <Link to="/player/labs">
              <Button variant="secondary" size="sm"><Icon name="biotech" className="text-base" /> Current labs</Button>
            </Link>
          }
        />

        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState icon="history_edu" title="No archived labs yet" description="Submit and evaluate a lab to create a detailed refresher diary here." />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5 items-start">
            <Card className="xl:sticky xl:top-6">
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
                <Icon name="archive" className="text-[#b4c5ff]" />
                <h2 className="font-semibold text-[#e1e2ed]">Past labs</h2>
                <Badge color="gray" className="ml-auto">{items.length}</Badge>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                {items.map((item) => (
                  <Link key={item.lab_id} to={`/player/archive/${item.lab_id}`} className="block">
                    <div className={`rounded-2xl border p-4 transition-all ${selectedId === item.lab_id ? "border-[#6f91ef]/45 bg-[#356df3]/12 shadow-[0_18px_45px_-30px_rgba(53,109,243,.9)]" : "border-white/[0.08] bg-white/[0.025] hover:border-white/[0.16] hover:bg-white/[0.045]"}`}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <Badge color="primary">Lab #{item.lab_id}</Badge>
                        <span className={`text-lg font-black ${pctColor(item.percent)}`}>{item.percent.toFixed(0)}%</span>
                      </div>
                      <h3 className="font-semibold text-[#edf0fa] line-clamp-2">{item.title}</h3>
                      <p className="mt-2 text-xs text-[#858b9d]">{formatDate(item.submitted_at || item.created_at)}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <DifficultyBadge difficulty={item.difficulty} />
                        <StatusBadge status={item.status} />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            {detailLoading ? <Spinner /> : detail ? <ArchiveDetailPanel detail={detail} /> : (
              <EmptyState icon="archive" title="Select an archived lab" description="Choose a completed lab to inspect its investigation diary." />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
