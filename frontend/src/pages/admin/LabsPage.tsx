import React, { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, StatusBadge, Spinner, EmptyState } from "../../components/ui";
import api from "../../api/client";
import type { Lab, User, Scenario } from "../../types";

export function AdminLabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState({ player_id: "", scenario_id: "" });
  const [error, setError] = useState("");

  const load = async () => {
    await Promise.all([
      api.get("/labs/all").then((r) => setLabs(r.data)),
      api.get("/users/").then((r) => setUsers(r.data.filter((u: User) => u.role === "player"))),
      api.get("/scenarios/").then((r) => setScenarios(r.data.filter((s: Scenario) => s.status === "published"))),
    ]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/labs/assign", {
        player_id: parseInt(form.player_id),
        scenario_id: parseInt(form.scenario_id),
      });
      setShowAssign(false);
      setForm({ player_id: "", scenario_id: "" });
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Assignment failed");
    }
  };

  const getUserName = (id: number) => users.find((u) => u.id === id)?.full_name || `User #${id}`;
  const getScenarioTitle = (id: number) => scenarios.find((s) => s.id === id)?.title
    || labs.find(() => true) && `Scenario #${id}` || `Scenario #${id}`;

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader
          title="Labs"
          subtitle={`${labs.length} total assignments`}
          action={<Button onClick={() => setShowAssign(true)}>📋 Assign Lab</Button>}
        />

        {/* Assign Modal */}
        {showAssign && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <h2 className="text-base font-semibold text-[#e6edf3] mb-4">Assign Lab to Player</h2>
              {error && <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded text-red-400 text-xs">{error}</div>}
              <form onSubmit={handleAssign} className="space-y-4">
                <div>
                  <label className="text-xs text-[#8b949e] mb-1 block">Player</label>
                  <select value={form.player_id} onChange={(e) => setForm({ ...form, player_id: e.target.value })} required
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500">
                    <option value="">Select a player...</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8b949e] mb-1 block">Published Scenario</label>
                  <select value={form.scenario_id} onChange={(e) => setForm({ ...form, scenario_id: e.target.value })} required
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500">
                    <option value="">Select a scenario...</option>
                    {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {scenarios.length === 0 && (
                    <p className="text-xs text-yellow-400 mt-1">⚠️ No published scenarios available. Publish a scenario first.</p>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit">Assign</Button>
                  <Button variant="secondary" onClick={() => setShowAssign(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {loading ? <Spinner /> : labs.length === 0 ? (
          <EmptyState icon="🧪" title="No labs assigned yet" description="Assign a published scenario to a player to create a lab" />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21262d]">
                  {["Player", "Scenario", "Status", "Started", "Submitted"].map((h) => (
                    <th key={h} className="text-left text-xs text-[#8b949e] font-medium py-2 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labs.map((lab) => (
                  <tr key={lab.id} className="border-b border-[#21262d] last:border-0 hover:bg-[#21262d]/30">
                    <td className="py-3 px-3 text-[#e6edf3]">{getUserName(lab.player_id)}</td>
                    <td className="py-3 px-3 text-[#8b949e]">{getScenarioTitle(lab.scenario_id)}</td>
                    <td className="py-3 px-3"><StatusBadge status={lab.status} /></td>
                    <td className="py-3 px-3 text-[#8b949e] text-xs">
                      {lab.started_at ? new Date(lab.started_at).toLocaleString() : "—"}
                    </td>
                    <td className="py-3 px-3 text-[#8b949e] text-xs">
                      {lab.submitted_at ? new Date(lab.submitted_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
