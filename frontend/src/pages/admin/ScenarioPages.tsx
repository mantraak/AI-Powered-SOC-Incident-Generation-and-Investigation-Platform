import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, StatusBadge, DifficultyBadge, Spinner, EmptyState, Input } from "../../components/ui";
import api from "../../api/client";
import type { Scenario } from "../../types";
import { MitreTechniqueSelector } from "../../components/mitre/MitreTechniqueSelector";

// ─── Scenario List ────────────────────────────────────────────────────────────
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
      <div className="p-6">
        <PageHeader
          title="Scenarios"
          subtitle={`${scenarios.length} total`}
          action={<Button onClick={() => navigate("/admin/scenarios/create")}>➕ New Scenario</Button>}
        />

        {loading ? <Spinner /> : scenarios.length === 0 ? (
          <EmptyState icon="🎯" title="No scenarios yet" description="Create your first AI-powered incident scenario" />
        ) : (
          <div className="space-y-3">
            {scenarios.map((s) => (
              <Card key={s.id} className="hover:border-[#30363d] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <Link to={`/admin/scenarios/${s.id}`} className="text-base font-semibold text-[#e6edf3] hover:text-cyan-400 transition-colors">
                        {s.title}
                      </Link>
                      <StatusBadge status={s.status} />
                      <DifficultyBadge difficulty={s.difficulty} />
                    </div>
                    {s.description && <p className="text-sm text-[#8b949e] line-clamp-1">{s.description}</p>}
                    <div className="flex gap-4 mt-2 text-xs text-[#8b949e]">
                      <span>📅 {new Date(s.created_at).toLocaleDateString()}</span>
                      <span>❓ {s.num_questions} questions</span>
                      {s.mitre_techniques?.length > 0 && (
                        <span>🎯 {s.mitre_techniques.slice(0, 3).join(", ")}{s.mitre_techniques.length > 3 ? "..." : ""}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button variant="secondary" size="sm" onClick={() => navigate(`/admin/scenarios/${s.id}`)}>View</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(s.id)}>Delete</Button>
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

// ─── Create Scenario ──────────────────────────────────────────────────────────
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
      <div className="p-6 max-w-3xl mx-auto">
        <PageHeader title="Create Scenario" subtitle="Configure a new AI-generated SOC incident" />

        {error && <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">{error}</div>}

        <Card>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">Scenario Title *</label>
                <input name="title" value={form.title} onChange={handleChange} required
                  placeholder="e.g. Compromised Developer and CI/CD Pipeline"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">Incident Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3}
                  placeholder="Brief description of the incident scenario..."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">Article / Report Text</label>
                <textarea name="article_text" value={form.article_text} onChange={handleChange} rows={6}
                  placeholder="Paste a cybersecurity article, threat report, or detailed incident description. The AI will use this as source material."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500" />
              </div>

              <MitreTechniqueSelector value={mitreTechniques} onChange={setMitreTechniques} />

              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">Indicators of Compromise (comma-separated)</label>
                <input name="iocs" value={form.iocs} onChange={handleChange}
                  placeholder="185.220.101.45, evil.com, d41d8cd98f00b204e9800998ecf8427e"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#8b949e] font-medium mb-1">Difficulty</label>
                  <select name="difficulty" value={form.difficulty} onChange={handleChange}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500">
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#8b949e] font-medium mb-1">Number of Questions</label>
                  <input name="num_questions" type="number" min="3" max="20" value={form.num_questions} onChange={handleChange}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Scenario"}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/admin/scenarios")}>Cancel</Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}

// ─── Scenario Detail ──────────────────────────────────────────────────────────
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
  if (!scenario) return <AppLayout><div className="p-6 text-[#8b949e]">Scenario not found</div></AppLayout>;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "timeline", label: "Timeline" },
    { key: "attack", label: "Attack Steps" },
    { key: "assets", label: "Assets" },
  ];

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <button onClick={() => navigate("/admin/scenarios")} className="text-xs text-[#8b949e] hover:text-[#e6edf3] mb-2 block">← Back to Scenarios</button>
            <h1 className="text-xl font-bold text-[#e6edf3]">{scenario.title}</h1>
            <div className="flex gap-2 mt-2">
              <StatusBadge status={scenario.status} />
              <DifficultyBadge difficulty={scenario.difficulty} />
            </div>
          </div>
          <div className="flex gap-2">
            {(scenario.status === "draft" || scenario.status === "validation_failed") && (
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? "⚡ Generating..." : "⚡ Generate with AI"}
              </Button>
            )}
            {(scenario.status === "ready" || scenario.status === "generated") && (
              <Button variant="success" onClick={handlePublish}>🚀 Publish</Button>
            )}
            {scenario.status === "generating" && (
              <div className="flex items-center gap-2 text-yellow-400 text-sm">
                <div className="w-4 h-4 border-2 border-yellow-700 border-t-yellow-400 rounded-full animate-spin" />
                Generating...
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-[#21262d]">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
                ${tab === t.key ? "border-cyan-500 text-cyan-400" : "border-transparent text-[#8b949e] hover:text-[#e6edf3]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">Summary</h3>
              <p className="text-sm text-[#8b949e]">{scenario.summary || scenario.description || "Not generated yet."}</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[#8b949e]">Questions</span><span className="text-[#e6edf3]">{scenario.num_questions}</span></div>
                <div className="flex justify-between"><span className="text-[#8b949e]">Created</span><span className="text-[#e6edf3]">{new Date(scenario.created_at).toLocaleDateString()}</span></div>
              </div>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-[#e6edf3] mb-3">MITRE Techniques</h3>
              <div className="flex flex-wrap gap-2">
                {scenario.mitre_techniques?.length ? scenario.mitre_techniques.map((t) => (
                  <span key={t} className="px-2 py-1 bg-purple-900/30 border border-purple-700 rounded text-xs text-purple-300">{t}</span>
                )) : <span className="text-sm text-[#8b949e]">None specified</span>}
              </div>
              <h3 className="text-sm font-semibold text-[#e6edf3] mt-4 mb-3">Indicators of Compromise</h3>
              <div className="flex flex-wrap gap-2">
                {scenario.iocs?.length ? scenario.iocs.map((ioc) => (
                  <span key={ioc} className="px-2 py-1 bg-red-900/30 border border-red-700 rounded text-xs text-red-300 font-mono">{ioc}</span>
                )) : <span className="text-sm text-[#8b949e]">None specified</span>}
              </div>
            </Card>
          </div>
        )}

        {tab === "timeline" && (
          <Card>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">Attack Timeline</h3>
            {scenario.timeline?.length ? (
              <div className="space-y-3">
                {scenario.timeline.map((item: any, i: number) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-xs font-mono text-cyan-400 w-16 shrink-0 pt-0.5">{item.time}</span>
                    <div className="flex-1 pb-3 border-b border-[#21262d] last:border-0">
                      <p className="text-sm text-[#e6edf3]">{item.event}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="📅" title="Timeline not generated yet" description="Generate the scenario to see the attack timeline" />}
          </Card>
        )}

        {tab === "attack" && (
          <Card>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">Attack Steps</h3>
            {scenario.attack_steps?.length ? (
              <div className="space-y-3">
                {scenario.attack_steps.map((step: any) => (
                  <div key={step.step} className="flex gap-4 p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                    <span className="text-lg font-bold text-cyan-500 w-8 shrink-0">{step.step}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-[#e6edf3]">{step.name}</span>
                        <span className="text-xs font-mono px-2 py-0.5 bg-purple-900/30 border border-purple-700 rounded text-purple-300">{step.technique}</span>
                      </div>
                      <p className="text-sm text-[#8b949e]">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="⚔️" title="No attack steps yet" description="Generate the scenario to see attack steps" />}
          </Card>
        )}

        {tab === "assets" && (
          <Card>
            <h3 className="text-sm font-semibold text-[#e6edf3] mb-4">Assets</h3>
            {scenario.assets?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {scenario.assets.map((asset: any) => (
                  <div key={asset.id} className="p-3 bg-[#0d1117] border border-[#21262d] rounded-lg">
                    <p className="text-sm font-semibold text-[#e6edf3] mb-1">🖥️ {asset.hostname}</p>
                    <div className="space-y-1 text-xs text-[#8b949e]">
                      <p>IP: <span className="font-mono text-cyan-400">{asset.ip}</span></p>
                      <p>Type: {asset.type}</p>
                      <p>Owner: {asset.owner}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon="🖥️" title="No assets defined" description="Generate the scenario to see affected assets" />}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
