import React, { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, StatusBadge, Spinner, EmptyState, Icon } from "../../components/ui";
import api from "../../api/client";
import type { Lab, User, Scenario } from "../../types";

const inputCls =
  "w-full bg-[#0c0e16] border border-[#434655] rounded-[10px] px-3 py-2 text-sm text-[#e1e2ed] placeholder-[#8d90a0] focus:outline-none focus:border-[#b4c5ff] focus:ring-2 focus:ring-[#b4c5ff]/20 transition-colors";

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
  const getScenarioTitle = (id: number) => scenarios.find((s) => s.id === id)?.title || `Scenario #${id}`;

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Labs"
          subtitle={`${labs.length} total lab assignments`}
          action={
            <Button onClick={() => setShowAssign(true)} data-testid="assign-lab-btn">
              <Icon name="assignment_ind" className="text-base" />
              Assign Lab
            </Button>
          }
        />

        {/* Assign Modal */}
        {showAssign && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#434655]">
                <h2 className="text-base font-semibold text-[#e1e2ed] flex items-center gap-2">
                  <Icon name="assignment_ind" className="text-[#b4c5ff] text-lg" />
                  Assign Lab to Player
                </h2>
                <button onClick={() => setShowAssign(false)} className="text-[#8d90a0] hover:text-[#e1e2ed]">
                  <Icon name="close" />
                </button>
              </div>
              {error && <div className="mb-3 p-2.5 bg-[#93000a]/25 border border-[#93000a]/60 rounded text-[#ffb4ab] text-xs">{error}</div>}
              <form onSubmit={handleAssign} className="space-y-4">
                <div>
                  <label className="text-[11px] text-[#8d90a0] font-semibold mb-1.5 block uppercase tracking-wider">Player</label>
                  <select
                    value={form.player_id}
                    onChange={(e) => setForm({ ...form, player_id: e.target.value })}
                    required
                    className={inputCls}
                  >
                    <option value="">Select a player…</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#8d90a0] font-semibold mb-1.5 block uppercase tracking-wider">Published Scenario</label>
                  <select
                    value={form.scenario_id}
                    onChange={(e) => setForm({ ...form, scenario_id: e.target.value })}
                    required
                    className={inputCls}
                  >
                    <option value="">Select a scenario…</option>
                    {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  {scenarios.length === 0 && (
                    <p className="text-xs text-amber-300 mt-1.5 flex items-center gap-1">
                      <Icon name="warning" className="text-xs" />
                      No published scenarios available. Publish a scenario first.
                    </p>
                  )}
                </div>
                <div className="flex gap-2 pt-3">
                  <Button type="submit">Assign</Button>
                  <Button variant="secondary" onClick={() => setShowAssign(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : labs.length === 0 ? (
          <EmptyState icon="biotech" title="No labs assigned yet" description="Assign a published scenario to a player to create a lab" />
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0c0e16] border-b border-[#434655]">
                    {["Player", "Scenario", "Status", "Started", "Submitted"].map((h) => (
                      <th key={h} className="text-left text-[11px] text-[#8d90a0] font-semibold py-3 px-4 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labs.map((lab) => (
                    <tr key={lab.id} className="border-b border-[#434655]/60 last:border-0 hover:bg-[#282a32]/40 transition-colors">
                      <td className="py-3 px-4 text-[#e1e2ed]">{getUserName(lab.player_id)}</td>
                      <td className="py-3 px-4 text-[#c3c6d7]">{getScenarioTitle(lab.scenario_id)}</td>
                      <td className="py-3 px-4"><StatusBadge status={lab.status} /></td>
                      <td className="py-3 px-4 text-[#8d90a0] text-xs font-mono">
                        {lab.started_at ? new Date(lab.started_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-[#8d90a0] text-xs font-mono">
                        {lab.submitted_at ? new Date(lab.submitted_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
