import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, StatusBadge, DifficultyBadge, Spinner, EmptyState, Icon, Badge } from "../../components/ui";
import api from "../../api/client";
import type { Scenario } from "../../types";
import { MitreTechniqueSelector } from "../../components/mitre/MitreTechniqueSelector";

const inputCls =
  "w-full bg-[#0c0e16] border border-[#434655] rounded-[10px] px-3 py-2 text-sm text-[#e1e2ed] placeholder-[#8d90a0] focus:outline-none focus:border-[#b4c5ff] focus:ring-2 focus:ring-[#b4c5ff]/20 transition-colors";

/* ════════════════════════ Scenario List ════════════════════════ */
export function AdminScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => api.get("/scenarios/").then((r) => setScenarios(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this scenario?")) return;
    await api.delete(`/scenarios/${id}`);
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Scenarios"
          subtitle={`${scenarios.length} total · AI-generated SOC incident library`}
          action={
            <Button onClick={() => navigate("/admin/scenarios/create")} data-testid="new-scenario-btn">
              <Icon name="add_circle" className="text-base" />
              New Scenario
            </Button>
          }
        />

        {loading ? (
          <Spinner />
        ) : scenarios.length === 0 ? (
          <EmptyState
            icon="manage_search"
            title="No scenarios yet"
            description="Create your first AI-powered incident scenario to begin training your SOC analysts"
          />
        ) : (
          <div className="space-y-3">
            {scenarios.map((s) => (
              <Card key={s.id} className="hover:border-[#b4c5ff]/30 transition-all" >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <Link
                        to={`/admin/scenarios/${s.id}`}
                        className="text-base font-semibold text-[#e1e2ed] hover:text-[#b4c5ff] transition-colors"
                        data-testid={`scenario-link-${s.id}`}
                      >
                        {s.title}
                      </Link>
                      <StatusBadge status={s.status} />
                      <DifficultyBadge difficulty={s.difficulty} />
                    </div>
                    {s.description && <p className="text-sm text-[#8d90a0] line-clamp-1 mb-2">{s.description}</p>}
                    <div className="flex gap-4 text-xs text-[#8d90a0] flex-wrap">
                      <span className="flex items-center gap-1">
                        <Icon name="calendar_today" className="text-xs" />
                        {new Date(s.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="quiz" className="text-xs" />
                        {s.num_questions} questions
                      </span>
                      {s.mitre_techniques?.length > 0 && (
                        <span className="flex items-center gap-1 font-mono">
                          <Icon name="target" className="text-xs" />
                          {s.mitre_techniques.slice(0, 3).join(", ")}
                          {s.mitre_techniques.length > 3 ? "…" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/scenarios/${s.id}`)}>
                      <Icon name="visibility" className="text-base" />
                      View
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(s.id)}>
                      <Icon name="delete" className="text-base" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* ════════════════════════ Create Scenario ════════════════════════ */
export function CreateScenarioPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "", description: "", article_text: "",
    iocs: "", difficulty: "intermediate", num_questions: "10",
  });
  const [mitreTechniques, setMitreTechniques] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const payload = {
        ...form,
        mitre_techniques: mitreTechniques,
        iocs: form.iocs.split(",").map((s) => s.trim()).filter(Boolean),
        num_questions: parseInt(form.num_questions),
      };
      const res = await api.post("/scenarios", payload);
      navigate(`/admin/scenarios/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create scenario");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader title="Create Scenario" subtitle="Configure a new AI-generated SOC incident" />

        {error && (
          <div className="mb-4 p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
            <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Scenario Title *</label>
                <input
                  name="title" value={form.title} onChange={handleChange} required
                  placeholder="e.g. Compromised Developer and CI/CD Pipeline"
                  className={inputCls} data-testid="scenario-title-input"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Incident Description</label>
                <textarea
                  name="description" value={form.description} onChange={handleChange} rows={3}
                  placeholder="Brief description of the incident scenario…"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Article / Report Text</label>
                <textarea
                  name="article_text" value={form.article_text} onChange={handleChange} rows={6}
                  placeholder="Paste a cybersecurity article, threat report, or detailed incident description. The AI will use this as source material."
                  className={inputCls}
                />
              </div>

              <MitreTechniqueSelector value={mitreTechniques} onChange={setMitreTechniques} />

              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Indicators of Compromise (comma-separated)</label>
                <input
                  name="iocs" value={form.iocs} onChange={handleChange}
                  placeholder="185.220.101.45, evil.com, d41d8cd98f00b204e9800998ecf8427e"
                  className={`${inputCls} font-mono text-xs`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Difficulty</label>
                  <select name="difficulty" value={form.difficulty} onChange={handleChange} className={inputCls}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Number of Questions</label>
                  <input
                    name="num_questions" type="number" min="3" max="20"
                    value={form.num_questions} onChange={handleChange}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} data-testid="create-scenario-submit-btn">
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Icon name="add_circle" className="text-base" />
                    Create Scenario
                  </>
                )}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/admin/scenarios")}>Cancel</Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}

/* ════════════════════════ Scenario Detail ════════════════════════ */
export function ScenarioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<"overview" | "timeline" | "attack" | "assets">("overview");

  const load = async () => {
    const res = await api.get(`/scenarios/${id}`);
    setScenario(res.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Poll while generating
  useEffect(() => {
    if (scenario?.status === "generating") {
      const interval = setInterval(async () => {
        const res = await api.get(`/scenarios/${id}`);
        setScenario(res.data);
        if (res.data.status !== "generating") clearInterval(interval);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [scenario?.status]);

  const handleGenerate = async () => {
    setGenerating(true);
    await api.post(`/scenarios/${id}/generate`);
    await load();
    setGenerating(false);
  };

  const handlePublish = async () => {
    await api.post(`/scenarios/${id}/publish`);
    await load();
  };

  if (loading) return <AppLayout><Spinner /></AppLayout>;
  if (!scenario) return <AppLayout><div className="p-6 text-[#8d90a0]">Scenario not found</div></AppLayout>;

  const tabs: { key: typeof tab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview",      icon: "info"         },
    { key: "timeline", label: "Timeline",      icon: "schedule"     },
    { key: "attack",   label: "Attack Steps",  icon: "stairs"       },
    { key: "assets",   label: "Assets",        icon: "dns"          },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <button
              onClick={() => navigate("/admin/scenarios")}
              className="text-xs text-[#8d90a0] hover:text-[#e1e2ed] mb-2 inline-flex items-center gap-1"
            >
              <Icon name="arrow_back" className="text-xs" />
              Back to Scenarios
            </button>
            <h1 className="text-2xl font-bold text-[#e1e2ed] tracking-tight">{scenario.title}</h1>
            <div className="flex gap-2 mt-2 items-center">
              <StatusBadge status={scenario.status} />
              <DifficultyBadge difficulty={scenario.difficulty} />
            </div>
          </div>
          <div className="flex gap-2">
            {(scenario.status === "draft" || scenario.status === "validation_failed") && (
              <Button onClick={handleGenerate} disabled={generating} data-testid="generate-scenario-btn">
                <Icon name="auto_awesome" className="text-base" />
                {generating ? "Generating…" : "Generate with AI"}
              </Button>
            )}
            {(scenario.status === "ready" || scenario.status === "generated") && (
              <Button variant="success" onClick={handlePublish} data-testid="publish-scenario-btn">
                <Icon name="rocket_launch" className="text-base" />
                Publish
              </Button>
            )}
            {scenario.status === "generating" && (
              <div className="flex items-center gap-2 text-amber-300 text-sm bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-500/30">
                <div className="w-4 h-4 border-2 border-amber-700 border-t-amber-300 rounded-full animate-spin" />
                Generating…
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[#434655] overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex items-center gap-2 ${
                tab === t.key
                  ? "border-[#b4c5ff] text-[#b4c5ff]"
                  : "border-transparent text-[#8d90a0] hover:text-[#e1e2ed]"
              }`}
            >
              <Icon name={t.icon} className="text-base" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#434655]">
                <Icon name="description" className="text-[#b4c5ff]" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Summary</h3>
              </div>
              <p className="text-sm text-[#c3c6d7] leading-relaxed">{scenario.summary || scenario.description || "Not generated yet."}</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#8d90a0]">Questions</span><span className="text-[#e1e2ed] font-mono">{scenario.num_questions}</span></div>
                <div className="flex justify-between"><span className="text-[#8d90a0]">Created</span><span className="text-[#e1e2ed] font-mono">{new Date(scenario.created_at).toLocaleDateString()}</span></div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#434655]">
                <Icon name="target" className="text-[#b4c5ff]" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">MITRE Techniques</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {scenario.mitre_techniques?.length ? scenario.mitre_techniques.map((t) => (
                  <Badge key={t} color="purple">{t}</Badge>
                )) : <span className="text-sm text-[#8d90a0]">None specified</span>}
              </div>
              <div className="flex items-center gap-2 mt-5 mb-3 pb-2 border-b border-[#434655]">
                <Icon name="fingerprint" className="text-[#ffb4ab]" />
                <h3 className="text-sm font-semibold text-[#e1e2ed]">Indicators of Compromise</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {scenario.iocs?.length ? scenario.iocs.map((ioc) => (
                  <span key={ioc} className="px-2 py-1 bg-[#93000a]/20 border border-[#93000a]/50 rounded-md text-xs text-[#ffb4ab] font-mono">{ioc}</span>
                )) : <span className="text-sm text-[#8d90a0]">None specified</span>}
              </div>
            </Card>
          </div>
        )}

        {tab === "timeline" && (
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#434655]">
              <Icon name="schedule" className="text-[#b4c5ff]" />
              <h3 className="text-sm font-semibold text-[#e1e2ed]">Attack Timeline</h3>
            </div>
            {scenario.timeline?.length ? (
              <div className="space-y-3">
                {scenario.timeline.map((item: any, i: number) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-xs font-mono text-[#b4c5ff] w-20 shrink-0 pt-0.5">{item.time}</span>
                    <div className="flex-1 pb-3 border-b border-[#434655]/50 last:border-0">
                      <p className="text-sm text-[#e1e2ed]">{item.event}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="schedule" title="Timeline not generated yet" description="Generate the scenario to see the attack timeline" />}
          </Card>
        )}

        {tab === "attack" && (
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#434655]">
              <Icon name="stairs" className="text-[#b4c5ff]" />
              <h3 className="text-sm font-semibold text-[#e1e2ed]">Attack Steps</h3>
            </div>
            {scenario.attack_steps?.length ? (
              <div className="space-y-3">
                {scenario.attack_steps.map((step: any) => (
                  <div key={step.step} className="flex gap-4 p-4 bg-[#0c0e16] rounded-lg border border-[#434655]">
                    <span className="text-2xl font-bold text-[#b4c5ff] w-10 shrink-0 leading-none">{step.step}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-sm font-semibold text-[#e1e2ed]">{step.name}</span>
                        <Badge color="purple">{step.technique}</Badge>
                      </div>
                      <p className="text-sm text-[#c3c6d7]">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="stairs" title="No attack steps yet" description="Generate the scenario to see attack steps" />}
          </Card>
        )}

        {tab === "assets" && (
          <Card>
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#434655]">
              <Icon name="dns" className="text-[#b4c5ff]" />
              <h3 className="text-sm font-semibold text-[#e1e2ed]">Assets</h3>
            </div>
            {scenario.assets?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scenario.assets.map((asset: any) => (
                  <div key={asset.id} className="p-3 bg-[#0c0e16] border border-[#434655] rounded-lg">
                    <p className="text-sm font-semibold text-[#e1e2ed] mb-2 flex items-center gap-2">
                      <Icon name="computer" className="text-[#b4c5ff]" />
                      {asset.hostname}
                    </p>
                    <div className="space-y-1 text-xs text-[#8d90a0]">
                      <p>IP: <span className="font-mono text-[#b4c5ff]">{asset.ip}</span></p>
                      <p>Type: <span className="text-[#c3c6d7]">{asset.type}</span></p>
                      <p>Owner: <span className="text-[#c3c6d7]">{asset.owner}</span></p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="dns" title="No assets defined" description="Generate the scenario to see affected assets" />}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
