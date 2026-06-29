import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, StatusBadge, Spinner, EmptyState, Icon } from "../../components/ui";
import { useAuth } from "../../store/authContext";
import api from "../../api/client";
import type { Lab } from "../../types";

export function PlayerDashboard() {
  const { user } = useAuth();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/labs/my").then((r) => setLabs(r.data)).finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: "Assigned Labs", value: labs.length, icon: "biotech",
      tone: { ring: "ring-[#2563eb]/30", iconBg: "bg-[#2563eb]/15", iconColor: "text-[#b4c5ff]" } },
    { label: "In Progress", value: labs.filter((l) => l.status === "in_progress").length, icon: "bolt",
      tone: { ring: "ring-amber-500/30", iconBg: "bg-amber-500/10", iconColor: "text-amber-300" } },
    { label: "Completed", value: labs.filter((l) => l.status === "evaluated").length, icon: "task_alt",
      tone: { ring: "ring-emerald-500/30", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-300" } },
    { label: "Submitted", value: labs.filter((l) => l.status === "submitted").length, icon: "send",
      tone: { ring: "ring-purple-500/30", iconBg: "bg-purple-500/10", iconColor: "text-purple-300" } },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title={`Welcome, ${user?.full_name?.split(" ")[0] ?? "Analyst"}`}
          subtitle="Your SOC investigation workspace"
        />

        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map((s) => (
                <Card key={s.label} className="h-full">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg ${s.tone.iconBg} ring-1 ${s.tone.ring} flex items-center justify-center`}>
                      <Icon name={s.icon} className={`text-xl ${s.tone.iconColor}`} />
                    </div>
                    <span className="text-3xl font-bold text-[#e1e2ed] tracking-tight">{s.value}</span>
                  </div>
                  <p className="text-xs font-medium text-[#8d90a0] uppercase tracking-wider">{s.label}</p>
                </Card>
              ))}
            </div>

            <Card>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#434655]">
                <div className="flex items-center gap-2.5">
                  <Icon name="biotech" className="text-[#b4c5ff] text-lg" />
                  <h2 className="text-sm font-semibold text-[#e1e2ed]">My Labs</h2>
                </div>
                <Link to="/player/labs" className="text-xs text-[#b4c5ff] hover:underline flex items-center gap-1">
                  View all <Icon name="arrow_forward" className="text-xs" />
                </Link>
              </div>
              {labs.length === 0 ? (
                <EmptyState icon="biotech" title="No labs assigned yet" description="Your instructor will assign labs to you soon." />
              ) : (
                <div className="space-y-2">
                  {labs.slice(0, 5).map((lab) => (
                    <Link key={lab.id} to={`/player/labs/${lab.id}`} className="block" data-testid={`lab-row-${lab.id}`}>
                      <div className="flex items-center justify-between p-3 rounded-lg hover:bg-[#282a32] border border-transparent hover:border-[#434655] transition-all">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-[#2563eb]/15 ring-1 ring-[#2563eb]/30 flex items-center justify-center flex-shrink-0">
                            <Icon name="science" className="text-lg text-[#b4c5ff]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#e1e2ed]">Lab #{lab.id} — Scenario #{lab.scenario_id}</p>
                            <p className="text-xs text-[#8d90a0] mt-0.5">
                              Assigned {new Date(lab.created_at).toLocaleDateString()}
                              {lab.started_at && ` · Started ${new Date(lab.started_at).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <StatusBadge status={lab.status} />
                          <Icon name="chevron_right" className="text-lg text-[#8d90a0]" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
