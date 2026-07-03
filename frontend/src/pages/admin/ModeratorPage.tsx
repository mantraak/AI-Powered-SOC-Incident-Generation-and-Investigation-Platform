import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { MitreTechniqueSelector } from "../../components/mitre/MitreTechniqueSelector";
import { Badge, Button, Card, Spinner, Icon } from "../../components/ui";
import type { ModeratorAnalysis } from "../../types";

const inputCls =
  "w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none focus:border-[#7f9eff] focus:ring-4 focus:ring-[#356df3]/15 transition-all shadow-inner";

function PlanList({ title, values, icon }: { title: string; values: string[]; icon: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#434655]">
        <Icon name={icon} className="text-[#b4c5ff]" />
        <h3 className="text-sm font-semibold text-[#e1e2ed]">{title}</h3>
      </div>
      {values.length === 0 ? (
        <p className="text-xs text-[#8d90a0]">None proposed.</p>
      ) : (
        <ul className="space-y-2">
          {values.map((value, index) => (
            <li key={index} className="text-sm text-[#c3c6d7] flex gap-2">
              <span className="text-[#b4c5ff] flex-shrink-0">▸</span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ModeratorPage() {
  const navigate = useNavigate();
  const [links, setLinks] = useState("");
  const [focus, setFocus] = useState("");
  const [mitreIds, setMitreIds] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<ModeratorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const analyze = async () => {
    const sourceLinks = links.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
    if (sourceLinks.length > 4) {
      setError("Provide no more than four public article links.");
      return;
    }
    if (sourceLinks.length === 0 && mitreIds.length === 0) {
      setError("Provide at least one public incident link or select a MITRE ATT&CK technique.");
      return;
    }
    setLoading(true); setError(""); setAnalysis(null);
    try {
      const response = await api.post<ModeratorAnalysis>("/moderator/analyze", {
        links: sourceLinks, mitre_ids: mitreIds, focus,
      });
      setAnalysis(response.data);
      setMitreIds(response.data.recommended_mitre_ids);
    } catch (err: any) {
      setError(err.response?.data?.detail || "AI Moderator analysis failed.");
    } finally { setLoading(false); }
  };

  const createScenario = async () => {
    if (!analysis) return;
    setCreating(true); setError("");
    try {
      const sourceText = analysis.sources.length
        ? analysis.sources.map((source) => `${source.title}: ${source.url}`).join("\n")
        : "MITRE ATT&CK-only scenario; no external incident article supplied.";
      const attackFlow = analysis.attack_flow
        .map((step) => `${step.order}. ${step.phase}: ${step.action}${step.mitre_id ? ` (${step.mitre_id})` : ""}`)
        .join("\n");
      const eventPlan = analysis.simulation_plan.events
        .map((event) => `${event.source}/${event.event_type}: ${event.description}; malicious=${event.malicious_count}; normal=${event.normal_count}${event.mitre_id ? `; ${event.mitre_id}` : ""}`)
        .join("\n");
      const moderatorPlan = [
        "AI MODERATOR REVIEWED PLAN",
        `Sources:\n${sourceText}`,
        `Attack flow:\n${attackFlow}`,
        `Required synthetic log plan:\n${eventPlan}`,
        `Required artifacts:\n${analysis.simulation_plan.artifacts.join("\n")}`,
        `Required alerts:\n${analysis.simulation_plan.alerts.join("\n")}`,
        `Investigation questions:\n${analysis.simulation_plan.investigation_questions.join("\n")}`,
        `Assumptions:\n${analysis.assumptions.join("\n")}`,
      ].join("\n\n");
      const response = await api.post("/scenarios/", {
        title: analysis.title,
        description: `${analysis.executive_summary}\n\n${analysis.attack_description}`,
        article_text: moderatorPlan,
        mitre_techniques: analysis.recommended_mitre_ids,
        iocs: [],
        difficulty: "intermediate",
        num_questions: Math.max(8, analysis.simulation_plan.investigation_questions.length),
      });
      navigate(`/admin/scenarios/${response.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to create scenario draft.");
    } finally { setCreating(false); }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <PageHeader
          title="AI Moderator"
          subtitle="Generate a safe SOC simulation from incident reporting, MITRE ATT&CK techniques, or both"
        />

        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#434655]">
            <Icon name="psychology" className="text-[#b4c5ff]" />
            <h3 className="text-sm font-semibold text-[#e1e2ed]">Inputs</h3>
          </div>
          <div className="space-y-5">
            <div>
              <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">
                Public incident links (optional, one per line, maximum four)
              </label>
              <textarea
                value={links}
                onChange={(event) => setLinks(event.target.value)}
                rows={4}
                placeholder={"https://security-vendor.example/report\nhttps://news.example/incident"}
                className={`${inputCls} font-mono text-xs`}
                data-testid="moderator-links-input"
              />
              <p className="text-xs text-[#8d90a0] mt-1">Leave this empty to generate exclusively from selected MITRE ATT&CK techniques.</p>
            </div>

            <div>
              <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Moderator focus</label>
              <textarea
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                rows={2}
                placeholder="Example: focus on initial access, identity compromise, and CI/CD telemetry"
                className={inputCls}
              />
            </div>

            <MitreTechniqueSelector value={mitreIds} onChange={setMitreIds} />

            {error && (
              <div className="p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
                <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}
            <Button onClick={analyze} disabled={loading} data-testid="moderator-analyze-btn">
              <Icon name="auto_awesome" className="text-base" />
              {loading ? "Analyzing sources…" : "Analyze attack"}
            </Button>
          </div>
        </Card>

        {loading && <Spinner />}

        {analysis && !loading && (
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4 pb-3 border-b border-[#434655]">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[#b4c5ff] font-semibold">Moderator analysis</p>
                  <h2 className="text-xl font-bold text-[#e1e2ed] mt-1">{analysis.title}</h2>
                </div>
                <Button onClick={createScenario} disabled={creating}>
                  <Icon name="add_circle" className="text-base" />
                  {creating ? "Creating…" : "Create scenario draft"}
                </Button>
              </div>
              <p className="text-sm text-[#e1e2ed] mb-3 leading-relaxed">{analysis.executive_summary}</p>
              <p className="text-sm text-[#c3c6d7] whitespace-pre-wrap leading-relaxed">{analysis.attack_description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {analysis.recommended_mitre_ids.map((id) => <Badge key={id} color="purple">{id}</Badge>)}
              </div>
            </Card>

            <div>
              <h2 className="text-sm font-semibold text-[#e1e2ed] mb-3 flex items-center gap-2">
                <Icon name="route" className="text-[#b4c5ff]" />
                Attack flow and evidence
              </h2>
              <div className="space-y-3">
                {analysis.attack_flow.map((step) => (
                  <Card key={`${step.order}-${step.action}`}>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="w-8 h-8 rounded-full bg-[#2563eb]/20 ring-1 ring-[#2563eb]/40 text-[#b4c5ff] flex items-center justify-center text-xs font-bold">{step.order}</span>
                      <span className="text-sm font-semibold text-[#e1e2ed]">{step.phase}</span>
                      {step.mitre_id && <Badge color="purple">{step.mitre_id}</Badge>}
                    </div>
                    <p className="text-sm text-[#e1e2ed] mb-2">{step.action}</p>
                    <p className="text-xs text-[#8d90a0]">Evidence: {step.evidence}</p>
                  </Card>
                ))}
              </div>
            </div>

            <Card>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#434655]">
                <Icon name="terminal" className="text-[#b4c5ff]" />
                <h2 className="text-sm font-semibold text-[#e1e2ed]">Synthetic log plan</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-[#8d90a0] border-b border-[#434655] uppercase tracking-wider">
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2 pr-3">MITRE</th>
                      <th className="py-2 pr-3">Malicious</th>
                      <th className="py-2">Background</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.simulation_plan.events.map((event, index) => (
                      <tr key={index} className="border-b border-[#434655]/50 last:border-0">
                        <td className="py-2 pr-3 text-[#b4c5ff] font-mono text-xs">{event.source}</td>
                        <td className="py-2 pr-3">
                          <p className="text-[#e1e2ed]">{event.event_type}</p>
                          <p className="text-xs text-[#8d90a0]">{event.description}</p>
                        </td>
                        <td className="py-2 pr-3">{event.mitre_id ? <Badge color="purple">{event.mitre_id}</Badge> : "—"}</td>
                        <td className="py-2 pr-3 text-[#ffb4ab] font-mono">{event.malicious_count}</td>
                        <td className="py-2 text-[#c3c6d7] font-mono">{event.normal_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PlanList title="Assets"                values={analysis.simulation_plan.assets}                  icon="dns" />
              <PlanList title="Synthetic artifacts"   values={analysis.simulation_plan.artifacts}               icon="folder_zip" />
              <PlanList title="SIEM alerts"           values={analysis.simulation_plan.alerts}                  icon="notifications_active" />
              <PlanList title="Investigation questions" values={analysis.simulation_plan.investigation_questions} icon="quiz" />
              <PlanList title="Containment actions"   values={analysis.simulation_plan.containment_actions}     icon="shield" />
              <PlanList title="Safety constraints"    values={analysis.safety_notes}                            icon="verified_user" />
            </div>

            <Card>
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#434655]">
                <Icon name="library_books" className="text-[#b4c5ff]" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Sources and assumptions</h3>
              </div>
              {analysis.sources.length === 0 && (
                <p className="text-xs text-[#8d90a0] mb-3">MITRE ATT&CK-only mode: no external incident source was used.</p>
              )}
              {analysis.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-[#b4c5ff] hover:underline mb-1.5 flex items-center gap-1.5"
                >
                  <Icon name="link" className="text-xs" />
                  {source.title}
                </a>
              ))}
              {analysis.assumptions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-amber-300 mb-2 font-semibold uppercase tracking-wider flex items-center gap-1">
                    <Icon name="info" className="text-xs" />
                    Simulation assumptions
                  </p>
                  <ul className="space-y-1">
                    {analysis.assumptions.map((value, index) => (
                      <li key={index} className="text-xs text-[#c3c6d7]">• {value}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.source_errors.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-[#ffb4ab] mb-2 font-semibold uppercase tracking-wider">Sources that could not be read</p>
                  {analysis.source_errors.map((item) => (
                    <p key={item.url} className="text-xs text-[#8d90a0]">{item.url}: {item.error}</p>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
