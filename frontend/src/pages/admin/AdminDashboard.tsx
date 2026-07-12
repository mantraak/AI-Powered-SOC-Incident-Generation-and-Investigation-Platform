import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Spinner, StatusBadge, DifficultyBadge, Icon, EmptyState } from "../../components/ui";
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
    {
      label: "Total Scenarios",
      value: scenarios.length,
      icon: "manage_search",
      tone: { ring: "ring-[#2563eb]/30", iconBg: "bg-[#2563eb]/15", iconColor: "text-[#b4c5ff]" },
      link: "/admin/scenarios",
    },
    {
      label: "Published",
      value: scenarios.filter((s) => s.status === "published").length,
      icon: "check_circle",
      tone: { ring: "ring-emerald-500/30", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-300" },
      link: "/admin/scenarios",
    },
    {
      label: "Total Users",
      value: users.length,
      icon: "group",
      tone: { ring: "ring-purple-500/30", iconBg: "bg-purple-500/10", iconColor: "text-purple-300" },
      link: "/admin/users",
    },
    {
      label: "Active Labs",
      value: labs.filter((l) => l.status === "in_progress").length,
      icon: "biotech",
      tone: { ring: "ring-amber-500/30", iconBg: "bg-amber-500/10", iconColor: "text-amber-300" },
      link: "/admin/labs",
    },
  ];

  const recentScenarios = [...scenarios]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const quickActions = [
    { label: "Create New Scenario", icon: "add_circle", link: "/admin/scenarios/create", desc: "Build an AI-powered incident" },
    { label: "Manage Users",        icon: "manage_accounts", link: "/admin/users", desc: "Add or edit player accounts" },
    { label: "Assign Labs",         icon: "assignment_ind", link: "/admin/labs", desc: "Assign scenarios to players" },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title={`Welcome back, ${user?.full_name?.split(" ")[0] ?? "Analyst"}`}
          subtitle="Mission Control · Platform overview and recent activity"
        />

        {loading ? (
          <Spinner />
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {statCards.map((s) => (
                <Link key={s.label} to={s.link} data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                  <Card className="hover:border-[#b4c5ff]/40 transition-all duration-200 cursor-pointer group h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`w-10 h-10 rounded-lg ${s.tone.iconBg} ring-1 ${s.tone.ring} flex items-center justify-center transition-transform group-hover:scale-105`}>
                        <Icon name={s.icon} className={`text-xl ${s.tone.iconColor}`} />
                      </div>
                      <span className="text-3xl font-bold text-[#e1e2ed] tracking-tight">{s.value}</span>
                    </div>
                    <p className="text-xs font-medium text-[#8d90a0] uppercase tracking-wider">{s.label}</p>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Scenarios */}
              <Card>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#434655]">
                  <div className="flex items-center gap-2.5">
                    <Icon name="history" className="text-[#b4c5ff] text-lg" />
                    <h2 className="text-sm font-semibold text-[#e1e2ed]">Recent Scenarios</h2>
                  </div>
                  <Link to="/admin/scenarios" className="text-xs text-[#b4c5ff] hover:underline flex items-center gap-1">
                    View all <Icon name="arrow_forward" className="text-xs" />
                  </Link>
                </div>
                {recentScenarios.length === 0 ? (
                  <EmptyState icon="manage_search" title="No scenarios yet" description="Generated scenarios will appear here" />
                ) : (
                  <div className="space-y-2">
                    {recentScenarios.map((s) => (
                      <Link key={s.id} to={`/admin/scenarios/${s.id}`} className="block">
                        <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-[#282a32] border border-transparent hover:border-[#434655] transition-all">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[#e1e2ed] font-medium truncate">{s.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <DifficultyBadge difficulty={s.difficulty} />
                            </div>
                          </div>
                          <StatusBadge status={s.status} />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              {/* Quick Actions */}
              <Card>
                <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-[#434655]">
                  <Icon name="bolt" className="text-[#b4c5ff] text-lg" />
                  <h2 className="text-sm font-semibold text-[#e1e2ed]">Quick Actions</h2>
                </div>
                <div className="space-y-2">
                  {quickActions.map((item) => (
                    <Link
                      key={item.label}
                      to={item.link}
                      data-testid={`quick-action-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#282a32] border border-[#434655] hover:border-[#b4c5ff]/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#2563eb]/15 ring-1 ring-[#2563eb]/30 flex items-center justify-center flex-shrink-0 group-hover:bg-[#2563eb]/25 transition-colors">
                        <Icon name={item.icon} className="text-xl text-[#b4c5ff]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#e1e2ed]">{item.label}</p>
                        <p className="text-xs text-[#8d90a0]">{item.desc}</p>
                      </div>
                      <Icon name="chevron_right" className="text-lg text-[#8d90a0] group-hover:text-[#b4c5ff] transition-colors" />
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
