import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../store/authContext";
import { Icon } from "../ui";

const adminNav = [
  { path: "/admin/dashboard",   label: "Dashboard",    icon: "dashboard"     },
  { path: "/admin/scenarios",   label: "Scenarios",    icon: "manage_search" },
  { path: "/admin/users",       label: "Users",        icon: "group"         },
  { path: "/admin/labs",        label: "Labs",         icon: "biotech"       },
  { path: "/admin/tools",       label: "SOC Tools",    icon: "construction"  },
  { path: "/admin/moderator",   label: "AI Moderator", icon: "psychology"    },
  { path: "/admin/ai-settings", label: "AI Settings",  icon: "settings"      },
];

const playerNav = [
  { path: "/player/dashboard", label: "Dashboard", icon: "dashboard" },
  { path: "/player/labs",      label: "My Labs",   icon: "biotech"   },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const nav = isAdmin ? adminNav : playerNav;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#11131b] overflow-hidden">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      {/* ════════════ Sidebar ════════════ */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-[#1d1f27]/98 border-r border-[#434655] flex flex-col shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-60 lg:flex-shrink-0 lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Brand */}
        <div className="px-4 py-5 border-b border-[#434655]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#2563eb]/20 border border-[#2563eb]/30 flex items-center justify-center">
              <Icon name="shield_person" filled className="text-xl text-[#b4c5ff]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#b4c5ff] tracking-wide leading-none">ROMULUS</p>
              <p className="text-[10px] text-[#8d90a0] uppercase tracking-[0.18em] mt-1">SOC Command</p>
            </div>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMenuOpen(false)}
              className="ml-auto w-8 h-8 rounded-lg text-[#8d90a0] hover:text-[#e1e2ed] hover:bg-[#282a32] flex items-center justify-center lg:hidden"
            >
              <Icon name="close" className="text-xl" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto" aria-label="Primary">
          <p className="text-[10px] font-semibold text-[#8d90a0] uppercase tracking-wider px-3 mb-2">
            {isAdmin ? "Administration" : "Workspace"}
          </p>
          {nav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMenuOpen(false)}
              data-testid={`nav-${item.path.replace(/\//g, "-").replace(/^-/, "")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-[#2563eb]/15 text-[#b4c5ff] border-l-2 border-[#b4c5ff] pl-[10px] font-semibold"
                    : "text-[#8d90a0] hover:text-[#e1e2ed] hover:bg-[#282a32]"
                }`
              }
            >
              <Icon name={item.icon} className="text-[18px]" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User block */}
        <div className="p-3 border-t border-[#434655]">
          <div className="px-3 py-2 mb-2 rounded-lg bg-[#282a32] border border-[#434655]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#2563eb]/30 border border-[#2563eb]/40 flex items-center justify-center text-[#b4c5ff] text-xs font-bold">
                {user?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#e1e2ed] truncate">{user?.full_name}</p>
                <p className="text-[10px] text-[#8d90a0] capitalize flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  {user?.role}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            data-testid="sidebar-logout-btn"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[#8d90a0] hover:text-[#ffb4ab] hover:bg-[#282a32] rounded-md transition-colors"
          >
            <Icon name="logout" className="text-sm" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ════════════ Main ════════════ */}
      <main className="relative flex-1 min-w-0 overflow-y-auto bg-[#11131b] app-workspace">
        <header className="sticky top-0 z-20 h-16 px-4 flex items-center justify-between bg-[#11131b]/85 border-b border-[#434655]/70 backdrop-blur-xl lg:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
            className="w-10 h-10 rounded-xl bg-[#1d1f27] border border-[#434655] text-[#c3c6d7] flex items-center justify-center hover:border-[#b4c5ff]/50 hover:text-[#b4c5ff] transition-colors"
          >
            <Icon name="menu" className="text-xl" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#2563eb]/20 border border-[#2563eb]/30 flex items-center justify-center">
              <Icon name="shield_person" filled className="text-lg text-[#b4c5ff]" />
            </div>
            <span className="text-xs font-bold tracking-wider text-[#b4c5ff]">ROMULUS</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-[#2563eb]/20 border border-[#2563eb]/30 flex items-center justify-center text-xs font-bold text-[#b4c5ff]">
            {user?.full_name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
        </header>
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 pb-5 border-b border-[#434655]">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-[#e1e2ed] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#8d90a0] mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 flex items-center">{action}</div>}
    </div>
  );
}
