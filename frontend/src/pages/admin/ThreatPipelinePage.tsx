import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, EmptyState, Icon, SeverityBadge, Spinner } from "../../components/ui";
import type {
  ThreatCandidate,
  ThreatFeedRun,
  ThreatFeedRunDetail,
  ThreatPipelineStatus,
} from "../../types";

const runStatusColor: Record<string, string> = {
  running: "yellow",
  completed: "green",
  partial: "yellow",
  failed: "error",
};

const candidateStatusColor: Record<string, string> = {
  identified: "gray",
  selected: "blue",
  generating: "yellow",
  lab_created: "green",
  failed: "error",
  duplicate: "purple",
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/**
 * Admin view for the automated 24h Threat-Feed → SOC Lab pipeline: schedule
 * status, run history, the Top-N threats each run identified, and the labs
 * they produced. Failed generations can be retried without touching any of
 * the existing manual scenario tooling.
 */
export function ThreatPipelinePage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState<ThreatPipelineStatus | null>(null);
  const [runs, setRuns] = useState<ThreatFeedRun[]>([]);
  const [detail, setDetail] = useState<ThreatFeedRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (selectRunId?: number) => {
    setLoading(true);
    try {
      const [statusResponse, runsResponse] = await Promise.all([
        api.get<ThreatPipelineStatus>("/threat-labs/status"),
        api.get<ThreatFeedRun[]>("/threat-labs/runs"),
      ]);
      setStatus(statusResponse.data);
      setRuns(runsResponse.data);
      const target = selectRunId ?? runsResponse.data[0]?.id;
      if (target) {
        const detailResponse = await api.get<ThreatFeedRunDetail>(`/threat-labs/runs/${target}`);
        setDetail(detailResponse.data);
      } else {
        setDetail(null);
      }
      setError("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not load the threat pipeline status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerRun = async () => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await api.post("/threat-labs/runs");
      setMessage("Pipeline started. Refresh in a moment to see the result.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not start the pipeline.");
    } finally {
      setBusy(false);
    }
  };

  const retry = async (candidate: ThreatCandidate) => {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await api.post<ThreatCandidate>(
        `/threat-labs/candidates/${candidate.id}/retry`
      );
      setMessage(
        response.data.status === "lab_created"
          ? `Lab regenerated for "${response.data.title}".`
          : `Retry finished with status "${response.data.status}".`
      );
      await load(detail?.id);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Retry failed.");
    } finally {
      setBusy(false);
    }
  };

  const stats = status
    ? [
        { label: "Articles processed", value: status.last_run?.articles_processed ?? 0, icon: "article" },
        { label: "Unique threats", value: status.last_run?.unique_threats_identified ?? 0, icon: "hub" },
        { label: "Top threats", value: status.last_run?.threats_selected ?? 0, icon: "trending_up" },
        { label: "Labs generated", value: status.last_run?.labs_created ?? 0, icon: "science" },
        { label: "Failed generations", value: status.last_run?.labs_failed ?? 0, icon: "error" },
        { label: "Published labs (total)", value: status.total_labs_generated, icon: "inventory_2" },
      ]
    : [];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Automated Threat Lab Pipeline"
          subtitle="Daily threat feed → correlated threats → ranked Top threats → AI scenarios → student labs"
          action={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => load(detail?.id)} disabled={loading || busy}>
                <Icon name="refresh" className="text-base" />
                Refresh
              </Button>
              <Button onClick={triggerRun} disabled={busy || !status?.enabled} data-testid="run-pipeline-btn">
                <Icon name="play_arrow" className="text-base" />
                Run now
              </Button>
            </div>
          }
        />

        {message && (
          <div className="mb-4 p-3 bg-emerald-900/25 border border-emerald-700/50 rounded-lg text-emerald-200 text-sm flex items-start gap-2">
            <Icon name="check_circle" filled className="text-base flex-shrink-0 mt-0.5" />
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
            <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : !status ? (
          <EmptyState
            icon="crisis_alert"
            title="Pipeline status unavailable"
            description="The automated threat lab pipeline could not be queried."
          />
        ) : (
          <>
            {/* Schedule */}
            <Card className="mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Field label="Status">
                  <Badge color={status.enabled ? "green" : "gray"}>
                    {status.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge color={status.scheduler_running ? "green" : "gray"} className="ml-2">
                    {status.scheduler_running ? "Scheduler running" : "Scheduler idle"}
                  </Badge>
                </Field>
                <Field label="Last run">
                  <span className="text-sm text-[#e1e2ed]">{formatDate(status.last_run?.started_at)}</span>
                  {status.last_run && (
                    <Badge color={runStatusColor[status.last_run.status] ?? "gray"} className="ml-2">
                      {status.last_run.status}
                    </Badge>
                  )}
                </Field>
                <Field label="Next run">
                  <span className="text-sm text-[#e1e2ed]">{formatDate(status.next_run_at)}</span>
                </Field>
                <Field label="Configuration">
                  <span className="text-xs text-[#8d90a0]">
                    every {status.interval_hours}h · top {status.generation_limit} · min score{" "}
                    {status.min_score} · {status.auto_publish ? "auto-publish" : "manual publish"}
                  </span>
                </Field>
              </div>
              {!status.news_api_key_configured && (
                <p className="mt-4 text-xs text-[#ffcf76] flex items-center gap-1.5">
                  <Icon name="warning" className="text-sm" />
                  No newsdata.io API key is configured — the pipeline cannot collect articles.
                  <button
                    type="button"
                    className="underline hover:text-[#ffdfa0]"
                    onClick={() => navigate("/admin/ai-settings")}
                  >
                    Configure it
                  </button>
                </p>
              )}
            </Card>

            {/* Last-run statistics */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
              {stats.map((stat) => (
                <Card key={stat.label} className="!p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon name={stat.icon} className="text-lg text-[#b4c5ff]" />
                    <span className="text-2xl font-bold text-[#e1e2ed]">{stat.value}</span>
                  </div>
                  <p className="text-[10px] font-medium text-[#8d90a0] uppercase tracking-wider">
                    {stat.label}
                  </p>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {/* Run history */}
              <Card className="xl:col-span-1">
                <h2 className="text-sm font-semibold text-[#e1e2ed] mb-3 flex items-center gap-2">
                  <Icon name="history" className="text-base text-[#b4c5ff]" />
                  Run history
                </h2>
                {runs.length === 0 ? (
                  <p className="text-xs text-[#8d90a0]">No pipeline runs recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto">
                    {runs.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => load(run.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          detail?.id === run.id
                            ? "bg-[#2563eb]/15 border-[#2563eb]/40"
                            : "bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-[#e1e2ed]">Run #{run.id}</span>
                          <Badge color={runStatusColor[run.status] ?? "gray"}>{run.status}</Badge>
                        </div>
                        <p className="text-[11px] text-[#8d90a0]">
                          {formatDate(run.started_at)} · {run.trigger}
                        </p>
                        <p className="text-[11px] text-[#737888] mt-0.5">
                          {run.articles_processed} articles · {run.unique_threats_identified} threats ·{" "}
                          {run.labs_created} labs
                          {run.labs_failed > 0 && ` · ${run.labs_failed} failed`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {/* Selected run detail */}
              <Card className="xl:col-span-2">
                {!detail ? (
                  <EmptyState
                    icon="crisis_alert"
                    title="No run selected"
                    description="Trigger the pipeline or select a run from the history."
                  />
                ) : (
                  <>
                    <h2 className="text-sm font-semibold text-[#e1e2ed] mb-3 flex items-center gap-2">
                      <Icon name="checklist" className="text-base text-[#b4c5ff]" />
                      Run #{detail.id} — threats identified
                    </h2>

                    {detail.errors.length > 0 && (
                      <div className="mb-3 p-3 rounded-lg bg-amber-900/20 border border-amber-700/40">
                        <p className="text-[11px] font-semibold text-[#ffcf76] mb-1">
                          {detail.errors.length} issue(s) recorded during this run
                        </p>
                        <ul className="text-[11px] text-[#d7c49a] space-y-0.5">
                          {detail.errors.slice(0, 6).map((item, index) => (
                            <li key={index}>
                              [{String(item.stage ?? "pipeline")}] {String(item.error ?? item.info ?? "")}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {detail.candidates.length === 0 ? (
                      <p className="text-xs text-[#8d90a0]">This run identified no threats.</p>
                    ) : (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {detail.candidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.07]"
                          >
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                {candidate.rank && (
                                  <span className="text-[11px] font-bold text-[#6f91ef]">
                                    #{candidate.rank}
                                  </span>
                                )}
                                <Badge color={candidateStatusColor[candidate.status] ?? "gray"}>
                                  {candidate.status.replace(/_/g, " ")}
                                </Badge>
                                {candidate.severity && <SeverityBadge severity={candidate.severity} />}
                                <Badge color="primary">{candidate.threat_score.toFixed(1)}/10</Badge>
                                {candidate.active_exploitation && (
                                  <Badge color="error">active exploitation</Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-xs font-medium text-[#e1e2ed] leading-snug">
                              {candidate.title}
                            </p>
                            <p className="text-[11px] text-[#8d90a0] mt-1">
                              {candidate.category?.replace(/_/g, " ")} · {candidate.article_count}{" "}
                              correlated article(s)
                              {candidate.cve_ids.length > 0 && ` · ${candidate.cve_ids.join(", ")}`}
                              {candidate.mitre_techniques.length > 0 &&
                                ` · ${candidate.mitre_techniques.slice(0, 4).join(", ")}`}
                            </p>
                            {candidate.error && (
                              <p className="text-[11px] text-[#ffb4ab] mt-1">{candidate.error}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {candidate.scenario_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate(`/admin/scenarios/${candidate.scenario_id}`)}
                                >
                                  <Icon name="tune" className="text-sm" />
                                  Open scenario #{candidate.scenario_id}
                                </Button>
                              )}
                              {candidate.source_url && (
                                <a href={candidate.source_url} target="_blank" rel="noreferrer">
                                  <Button variant="ghost" size="sm">
                                    <Icon name="open_in_new" className="text-sm" />
                                    Source
                                  </Button>
                                </a>
                              )}
                              {(candidate.status === "failed" || candidate.status === "identified") && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => retry(candidate)}
                                  data-testid={`retry-candidate-${candidate.id}-btn`}
                                >
                                  <Icon name="restart_alt" className="text-sm" />
                                  Retry generation
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#8d90a0] uppercase tracking-wider mb-1.5">
        {label}
      </p>
      <div className="flex items-center flex-wrap">{children}</div>
    </div>
  );
}
