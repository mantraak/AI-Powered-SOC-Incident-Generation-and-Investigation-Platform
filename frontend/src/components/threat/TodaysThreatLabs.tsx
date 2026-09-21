import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../store/authContext";
import { Badge, Button, Card, Icon, SeverityBadge, Spinner } from "../ui";
import type { ThreatLab, ThreatLabStart } from "../../types";

/**
 * "Today's Threat Labs" – the student-facing surface of the automated 24h
 * Threat-Feed → SOC Lab pipeline. Everything shown here comes from the
 * backend: the score is the persisted ranking score, the labs are real
 * published scenarios, and "Start Investigation" self-enrols the student into
 * the ordinary PlayerLab investigation workspace.
 *
 * Rendered above the existing Threat Feed; it never replaces it, and it hides
 * itself entirely when the pipeline has not produced anything yet.
 */
export function TodaysThreatLabs() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [labs, setLabs] = useState<ThreatLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<ThreatLab[]>("/threat-labs/today");
      setLabs(response.data);
      setError("");
    } catch (err: any) {
      setLabs([]);
      setError(err.response?.data?.detail || "Could not load today's threat labs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startInvestigation = async (lab: ThreatLab) => {
    if (lab.my_lab_id) {
      navigate(`/player/labs/${lab.my_lab_id}`);
      return;
    }
    setStarting(lab.scenario_id);
    setError("");
    try {
      const response = await api.post<ThreatLabStart>(`/threat-labs/${lab.scenario_id}/start`);
      navigate(`/player/labs/${response.data.lab_id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not open this threat lab.");
    } finally {
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <div className="mb-8">
        <SectionTitle />
        <Spinner />
      </div>
    );
  }

  // Nothing generated yet – stay out of the way of the existing feed.
  if (!labs.length && !error) return null;

  return (
    <div className="mb-8" data-testid="todays-threat-labs">
      <SectionTitle onRefresh={load} />

      {error && (
        <div className="mb-3 p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
          <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {labs.map((lab) => (
          <Card
            key={lab.scenario_id}
            className="flex flex-col hover:border-[#6f91ef]/30 hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#6f91ef] tracking-widest">
                  #{lab.threat_rank ?? "-"}
                </span>
                {lab.threat_severity && <SeverityBadge severity={lab.threat_severity} />}
              </div>
              {lab.active_exploitation && (
                <Badge color="error">
                  <Icon name="bolt" className="text-[13px]" />
                  Active exploitation
                </Badge>
              )}
            </div>

            <h3 className="text-sm font-semibold text-[#e1e2ed] leading-snug mb-2 line-clamp-3">
              {lab.title}
            </h3>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              {typeof lab.threat_score === "number" && (
                <Badge color="primary">
                  Threat score {lab.threat_score.toFixed(1)}/10
                </Badge>
              )}
              {lab.threat_category && <Badge color="cyan">{lab.threat_category.replace(/_/g, " ")}</Badge>}
              {lab.cve_ids.slice(0, 2).map((cve) => (
                <Badge key={cve} color="yellow">{cve}</Badge>
              ))}
            </div>

            {lab.mitre_techniques.length > 0 && (
              <p className="text-[11px] text-[#8d90a0] mb-2">
                <span className="text-[#737888]">MITRE ATT&amp;CK:</span>{" "}
                {lab.mitre_techniques.slice(0, 5).join(", ")}
                {lab.mitre_techniques.length > 5 && ` +${lab.mitre_techniques.length - 5}`}
              </p>
            )}

            {lab.score_explanation.length > 0 && (
              <ul className="text-[11px] text-[#8d90a0] space-y-1 mb-3 list-none">
                {lab.score_explanation.slice(0, 3).map((reason, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <Icon name="chevron_right" className="text-[13px] text-[#6f91ef] mt-px" />
                    <span className="leading-snug">{reason}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-auto pt-3 border-t border-white/[0.07] flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => startInvestigation(lab)}
                disabled={starting === lab.scenario_id}
                data-testid={`start-threat-lab-${lab.scenario_id}-btn`}
              >
                {starting === lab.scenario_id ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Icon name="play_arrow" className="text-sm" />
                )}
                {lab.my_lab_id ? "Continue Investigation" : "Start Investigation"}
              </Button>
              {lab.source_url && (
                <a href={lab.source_url} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="sm">
                    <Icon name="open_in_new" className="text-sm" />
                    Source
                  </Button>
                </a>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/admin/scenarios/${lab.scenario_id}`)}
                >
                  <Icon name="tune" className="text-sm" />
                  Scenario
                </Button>
              )}
            </div>

            <p className="text-[10px] text-[#737888] mt-2">
              Generated automatically from {lab.article_count} correlated report
              {lab.article_count === 1 ? "" : "s"}
              {lab.source_title ? ` · ${lab.source_title}` : ""}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ onRefresh }: { onRefresh?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-[#356df3]/15 ring-1 ring-[#557ff0]/25 flex items-center justify-center">
          <Icon name="crisis_alert" filled className="text-lg text-[#b4c5ff]" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[#e1e2ed]">Today's Threat Labs</h2>
          <p className="text-[11px] text-[#8d90a0]">
            Top threats from the last 24 hours, ranked and turned into investigations
          </p>
        </div>
      </div>
      {onRefresh && (
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <Icon name="refresh" className="text-sm" />
          Refresh
        </Button>
      )}
    </div>
  );
}
