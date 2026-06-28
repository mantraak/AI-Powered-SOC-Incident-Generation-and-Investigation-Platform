import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Spinner } from "../../components/ui";
import { useAuth } from "../../store/authContext";
import api from "../../api/client";
import type { Scenario, User, Lab } from "../../types";

export function AdminDashboard() {
  const { user } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/scenarios/").then((r) => setScenarios(r.data)),
      api.get("/users/").then((r) => setUsers(r.data)),
      api.get("/labs/all").then((r) => setLabs(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const statCards = [
    { label: "Total Scenarios", value: scenarios.length, icon: "🎯", color: "text-cyan-400", link: "/admin/scenarios" },
    { label: "Published", value: scenarios.filter((s) => s.status === "published").length, icon: "✅", color: "text-green-400", link: "/admin/scenarios" },
    { label: "Total Users", value: users.length, icon: "👥", color: "text-purple-400", link: "/admin/users" },
    { label: "Active Labs", value: labs.filter((l) => l.status === "in_progress").length, icon: "🧪", color: "text-yellow-400", link: "/admin/labs" },
  ];

  const recentScenarios = [...scenarios].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  const difficultyColor: Record<string, string> = { beginner: "text-green-400", intermediate: "text-yellow-400", advanced: "text-red-400" };
  const statusColor: Record<string, string> = {
    draft: "text-gray-400", generating: "text-yellow-400", generated: "text-blue-400",
    validation_failed: "text-red-400", ready: "text-green-400", published: "text-cyan-400",
  };

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader
          title={`Welcome back, ${user?.full_name?.split(" ")[0]} 👋`}
          subtitle="Platform overview and recent activity"
        />

        {loading ? <Spinner /> : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {statCards.map((s) => (
                <Link key={s.label} to={s.link}>
                  <Card className="hover:border-[#30363d] transition-colors cursor-pointer">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{s.icon}</span>
                      <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
                    </div>
                    <p className="text-xs text-[#8b949e]">{s.label}</p>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Scenarios */}
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-[#e6edf3]">Recent Scenarios</h2>
                  <Link to="/admin/scenarios" className="text-xs text-cyan-400 hover:underline">View all →</Link>
                </div>
                {recentScenarios.length === 0 ? (
                  <p className="text-sm text-[#8b949e] text-center py-6">No scenarios yet</p>
                ) : (
                  <div className="space-y-3">
                    {recentScenarios.map((s) => (
                      <Link key={s.id} to={`/admin/scenarios/${s.id}`} className="block">
                        <div className="flex items-center justify-between p-2 rounded hover:bg-[#21262d] transition-colors">
                          <div>
                            <p className="text-sm text-[#e6edf3] font-medium">{s.title}</p>
                            <p className={`text-xs ${difficultyColor[s.difficulty]}`}>{s.difficulty}</p>
                          </div>
                          <span className={`text-xs font-medium ${statusColor[s.status]}`}>{s.status}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              {/* Quick Actions */}
              <Card>
                <h2 className="text-sm font-semibold text-[#e6edf3] mb-4">Quick Actions</h2>
                <div className="space-y-2">
                  {[
                    { label: "Create New Scenario", icon: "➕", link: "/admin/scenarios/create", desc: "Build an AI-powered incident" },
                    { label: "Manage Users", icon: "👥", link: "/admin/users", desc: "Add or edit player accounts" },
                    { label: "Assign Labs", icon: "📋", link: "/admin/labs", desc: "Assign scenarios to players" },
                  ].map((item) => (
                    <Link key={item.label} to={item.link} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#21262d] border border-[#21262d] hover:border-[#30363d] transition-colors">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-[#e6edf3]">{item.label}</p>
                        <p className="text-xs text-[#8b949e]">{item.desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
