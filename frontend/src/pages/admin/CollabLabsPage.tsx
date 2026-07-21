import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, Icon, Input, Spinner, EmptyState, Badge } from "../../components/ui";
import api from "../../api/client";
import { labGroupsApi } from "../../api/labGroups";
import type { AdminLabGroupRow, Scenario } from "../../types";

export function AdminCollabLabsPage() {
  const [rows, setRows] = useState<AdminLabGroupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [name, setName] = useState("");
  const [scenarioId, setScenarioId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    labGroupsApi
      .adminList({ search, status_filter: statusFilter || undefined, page, page_size: pageSize })
      .then((d) => {
        setRows(d.items);
        setTotal(d.total);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [page, statusFilter]);
  useEffect(() => {
    const handle = setTimeout(() => { setPage(1); load(); }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    api.get<Scenario[]>("/scenarios/published").then((r) => setScenarios(r.data));
  }, []);

  const createLab = async () => {
    if (!name.trim() || !scenarioId) return;
    setCreating(true);
    setError(null);
    try {
      await labGroupsApi.create(Number(scenarioId), name.trim());
      setName("");
      setScenarioId("");
      setShowCreate(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Could not create lab");
    } finally {
      setCreating(false);
    }
  };

  const deleteLab = async (id: number, labName: string) => {
    if (!confirm(`Delete "${labName}"? This removes all members, tasks, notes, chat and shared evidence for this lab.`)) return;
    await labGroupsApi.remove(id);
    load();
  };

  const toggleStatus = async (row: AdminLabGroupRow) => {
    if (row.status === "open") await labGroupsApi.update(row.id, { status: "closed" });
    else await labGroupsApi.reopen(row.id);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader title="Collaborative Labs" subtitle="Create and manage multi-analyst investigation labs" />

        <div className="flex flex-wrap items-center gap-2.5 mb-5">
          <div className="flex-1 min-w-[200px]">
            <Input label="Search" name="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by lab or scenario name…" />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <Button onClick={() => setShowCreate((s) => !s)}>
            <Icon name="add" className="text-sm" /> Create Lab
          </Button>
        </div>

        {showCreate && (
          <Card className="mb-6">
            <div className="space-y-3 max-w-md">
              <Input label="Lab name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Incident 42 - Team Alpha" />
              <div>
                <label className="text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wider">Scenario</label>
                <select
                  value={scenarioId}
                  onChange={(e) => setScenarioId(e.target.value)}
                  className="mt-1.5 w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
                >
                  <option value="">Select a published scenario…</option>
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-xs text-[#ffb4ab]">{error}</p>}
              <Button size="sm" onClick={createLab} disabled={creating || !name.trim() || !scenarioId}>
                <Icon name="check" className="text-sm" /> Create
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon="groups" title="No collaborative labs found" description="Create one, or adjust your search/filter." />
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03] text-[#8d90a0] uppercase tracking-wide text-[10px]">
                    <th className="text-left px-4 py-3 font-semibold">Lab Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Scenario</th>
                    <th className="text-left px-4 py-3 font-semibold">Owner</th>
                    <th className="text-left px-4 py-3 font-semibold">Created</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Members</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-white/[0.05]">
                      <td className="px-4 py-3 text-[#e1e2ed] font-medium">{row.name}</td>
                      <td className="px-4 py-3 text-[#c3c6d7]">{row.scenario_title ?? `#${row.scenario_id}`}</td>
                      <td className="px-4 py-3 text-[#c3c6d7]">{row.owner_name ?? "—"}</td>
                      <td className="px-4 py-3 text-[#8d90a0]">{new Date(row.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <Badge color={row.status === "open" ? "blue" : "gray"}>{row.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-[#c3c6d7]">{row.member_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link to={`/admin/collab-labs/${row.id}`} title="View / Manage">
                            <button className="w-7 h-7 rounded-lg text-[#8d90a0] hover:text-[#b4c5ff] hover:bg-[#282a32] flex items-center justify-center">
                              <Icon name="visibility" className="text-sm" />
                            </button>
                          </Link>
                          <Link to={`/admin/collab-labs/${row.id}`} title="Edit / Assign members">
                            <button className="w-7 h-7 rounded-lg text-[#8d90a0] hover:text-[#b4c5ff] hover:bg-[#282a32] flex items-center justify-center">
                              <Icon name="edit" className="text-sm" />
                            </button>
                          </Link>
                          <button
                            onClick={() => toggleStatus(row)}
                            title={row.status === "open" ? "Close lab" : "Reopen lab"}
                            className="w-7 h-7 rounded-lg text-[#8d90a0] hover:text-amber-300 hover:bg-[#282a32] flex items-center justify-center"
                          >
                            <Icon name={row.status === "open" ? "lock" : "lock_open"} className="text-sm" />
                          </button>
                          <button
                            onClick={() => deleteLab(row.id, row.name)}
                            title="Delete lab"
                            className="w-7 h-7 rounded-lg text-[#8d90a0] hover:text-[#ffb4ab] hover:bg-[#282a32] flex items-center justify-center"
                          >
                            <Icon name="delete" className="text-sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                <span className="text-[11px] text-[#8d90a0]">
                  Page {page} of {totalPages} · {total} labs
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <Icon name="chevron_left" className="text-sm" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <Icon name="chevron_right" className="text-sm" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
