import { useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { MitreTechniqueSelector } from "../../components/mitre/MitreTechniqueSelector";
import { Badge, Button, Card, Spinner } from "../../components/ui";
import type { ModeratorAnalysis } from "../../types";

function PlanList({ title, values }: { title: string; values: string[] }) {
  return (
    <Card>
      <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">{title}</h3>
      {values.length === 0 ? <p className="text-xs text-[#8b949e]">None proposed.</p> : (
        <ul className="space-y-2">
          {values.map((value, index) => <li key={index} className="text-sm text-[#8b949e]">• {value}</li>)}
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
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const response = await api.post<ModeratorAnalysis>("/moderator/analyze", {
        links: sourceLinks,
        mitre_ids: mitreIds,
        focus,
      });
      setAnalysis(response.data);
      setMitreIds(response.data.recommended_mitre_ids);
    } catch (err: any) {
      setError(err.response?.data?.detail || "AI Moderator analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  const createScenario = async () => {
    if (!analysis) return;
    setCreating(true);
    setError("");
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
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <PageHeader
          title="AI Moderator"
          subtitle="Generate a safe SOC simulation from incident reporting, MITRE ATT&CK techniques, or both"
        />

        <Card className="mb-6">
          <div className="space-y-5">
            <div>
              <label className="block text-xs text-[#8b949e] font-medium mb-1">Public incident links (optional, one per line, maximum four)</label>
              <textarea
                value={links}
                onChange={(event) => setLinks(event.target.value)}
                rows={4}
                placeholder={"https://security-vendor.example/report\nhttps://news.example/incident"}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
              />
              <p className="text-xs text-[#484f58] mt-1">Leave this empty to generate exclusively from selected MITRE ATT&CK techniques.</p>
            </div>

            <div>
              <label className="block text-xs text-[#8b949e] font-medium mb-1">Moderator focus</label>
              <textarea
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
                rows={2}
                placeholder="Example: focus on initial access, identity compromise, and CI/CD telemetry"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
              />
            </div>

            <MitreTechniqueSelector value={mitreIds} onChange={setMitreIds} />

            {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">{error}</div>}
            <Button onClick={analyze} disabled={loading}>{loading ? "Analyzing sources..." : "Analyze attack"}</Button>
          </div>
        </Card>

        {loading && <Spinner />}

        {analysis && !loading && (
          <div className="space-y-6">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-cyan-400">Moderator analysis</p>
                  <h2 className="text-xl font-bold text-[#e6edf3] mt-1">{analysis.title}</h2>
                </div>
                <Button onClick={createScenario} disabled={creating}>{creating ? "Creating..." : "Create scenario draft"}</Button>
              </div>
              <p className="text-sm text-[#e6edf3] mb-3">{analysis.executive_summary}</p>
              <p className="text-sm text-[#8b949e] whitespace-pre-wrap">{analysis.attack_description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {analysis.recommended_mitre_ids.map((id) => <Badge key={id} color="purple">{id}</Badge>)}
              </div>
            </Card>

            <div>
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-3">Attack flow and evidence</h2>
              <div className="space-y-3">
                {analysis.attack_flow.map((step) => (
                  <Card key={`${step.order}-${step.action}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="w-7 h-7 rounded-full bg-cyan-900/40 text-cyan-300 flex items-center justify-center text-xs">{step.order}</span>
                      <span className="text-sm font-semibold text-[#e6edf3]">{step.phase}</span>
                      {step.mitre_id && <Badge color="purple">{step.mitre_id}</Badge>}
                    </div>
                    <p className="text-sm text-[#e6edf3]">{step.action}</p>
                    <p className="text-xs text-[#8b949e] mt-2">Evidence: {step.evidence}</p>
                  </Card>
                ))}
              </div>
            </div>

            <Card>
              <h2 className="text-sm font-semibold text-[#e6edf3] mb-3">Synthetic log plan</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-[#8b949e] border-b border-[#30363d]"><th className="py-2">Source</th><th>Event</th><th>MITRE</th><th>Malicious</th><th>Background</th></tr></thead>
                  <tbody>{analysis.simulation_plan.events.map((event, index) => (
                    <tr key={index} className="border-b border-[#21262d]">
                      <td className="py-2 text-cyan-300">{event.source}</td>
                      <td className="py-2"><p className="text-[#e6edf3]">{event.event_type}</p><p className="text-xs text-[#8b949e]">{event.description}</p></td>
                      <td>{event.mitre_id || "—"}</td><td>{event.malicious_count}</td><td>{event.normal_count}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PlanList title="Assets" values={analysis.simulation_plan.assets} />
              <PlanList title="Synthetic artifacts" values={analysis.simulation_plan.artifacts} />
              <PlanList title="SIEM alerts" values={analysis.simulation_plan.alerts} />
              <PlanList title="Investigation questions" values={analysis.simulation_plan.investigation_questions} />
              <PlanList title="Containment actions" values={analysis.simulation_plan.containment_actions} />
              <PlanList title="Safety constraints" values={analysis.safety_notes} />
            </div>

            <Card>
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">Sources and assumptions</h3>
              {analysis.sources.length === 0 && <p className="text-xs text-[#8b949e] mb-3">MITRE ATT&CK-only mode: no external incident source was used.</p>}
              {analysis.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="block text-sm text-cyan-400 hover:underline mb-1">{source.title}</a>)}
              {analysis.assumptions.length > 0 && <div className="mt-4"><p className="text-xs text-yellow-400 mb-2">Simulation assumptions</p><ul className="space-y-1">{analysis.assumptions.map((value, index) => <li key={index} className="text-xs text-[#8b949e]">• {value}</li>)}</ul></div>}
              {analysis.source_errors.length > 0 && <div className="mt-4"><p className="text-xs text-red-400 mb-2">Sources that could not be read</p>{analysis.source_errors.map((item) => <p key={item.url} className="text-xs text-[#8b949e]">{item.url}: {item.error}</p>)}</div>}
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
