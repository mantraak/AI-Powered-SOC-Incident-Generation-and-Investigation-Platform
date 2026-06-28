import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../store/authContext";

const adminNav = [
  { path: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/admin/scenarios", label: "Scenarios", icon: "🎯" },
  { path: "/admin/users", label: "Users", icon: "👥" },
  { path: "/admin/labs", label: "Labs", icon: "🧪" },
];

const playerNav = [
  { path: "/player/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/player/labs", label: "My Labs", icon: "🧪" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const nav = isAdmin ? adminNav : playerNav;

  return (
    <div className="flex h-screen bg-[#0d1117] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-[#161b22] border-r border-[#21262d] flex flex-col">
        <div className="p-4 border-b border-[#21262d]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <div>
              <p className="text-sm font-bold text-cyan-400">AI SOC</p>
              <p className="text-xs text-[#8b949e]">Platform</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors
                ${isActive
                  ? "bg-cyan-900/30 text-cyan-400 border border-cyan-800/40"
                  : "text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-[#21262d]">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-[#e6edf3] truncate">{user?.full_name}</p>
            <p className="text-xs text-[#8b949e]">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="w-full text-left px-3 py-1.5 text-xs text-[#8b949e] hover:text-red-400 transition-colors rounded"
          >
            ← Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title, subtitle, action
}: {
  title: string; subtitle?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-[#e6edf3]">{title}</h1>
        {subtitle && <p className="text-sm text-[#8b949e] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
