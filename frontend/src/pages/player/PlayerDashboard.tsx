import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, StatusBadge, Spinner, EmptyState } from "../../components/ui";
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
    { label: "Assigned Labs", value: labs.length, icon: "🧪", color: "text-cyan-400" },
    { label: "In Progress", value: labs.filter((l) => l.status === "in_progress").length, icon: "⚡", color: "text-yellow-400" },
    { label: "Completed", value: labs.filter((l) => l.status === "evaluated").length, icon: "✅", color: "text-green-400" },
    { label: "Submitted", value: labs.filter((l) => l.status === "submitted").length, icon: "📤", color: "text-purple-400" },
  ];

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader
          title={`Welcome, ${user?.full_name?.split(" ")[0]} 👋`}
          subtitle="Your SOC investigation dashboard"
        />

        {loading ? <Spinner /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map((s) => (
                <Card key={s.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{s.icon}</span>
                    <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
                  </div>
                  <p className="text-xs text-[#8b949e]">{s.label}</p>
                </Card>
              ))}
            </div>

            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#e6edf3]">My Labs</h2>
                <Link to="/player/labs" className="text-xs text-cyan-400 hover:underline">View all →</Link>
              </div>
              {labs.length === 0 ? (
                <EmptyState icon="🧪" title="No labs assigned yet" description="Your instructor will assign labs to you soon." />
              ) : (
                <div className="space-y-3">
                  {labs.slice(0, 5).map((lab) => (
                    <Link key={lab.id} to={`/player/labs/${lab.id}`} className="block">
                      <div className="flex items-center justify-between p-3 rounded-md hover:bg-[#21262d] transition-colors border border-transparent hover:border-[#30363d]">
                        <div>
                          <p className="text-sm font-medium text-[#e6edf3]">Lab #{lab.id} — Scenario #{lab.scenario_id}</p>
                          <p className="text-xs text-[#8b949e] mt-0.5">
                            Assigned {new Date(lab.created_at).toLocaleDateString()}
                            {lab.started_at && ` · Started ${new Date(lab.started_at).toLocaleDateString()}`}
                          </p>
                        </div>
                        <StatusBadge status={lab.status} />
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
