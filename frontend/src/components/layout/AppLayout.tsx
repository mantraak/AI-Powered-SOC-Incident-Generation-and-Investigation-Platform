import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../store/authContext";
import { Icon } from "../ui";

const adminNav = [
  { path: "/admin/dashboard",     label: "Dashboard",          icon: "dashboard"     },
  { path: "/admin/scenarios",     label: "Scenarios",          icon: "manage_search" },
  { path: "/admin/users",         label: "Users",              icon: "group"         },
  { path: "/admin/labs",          label: "Labs",               icon: "biotech"       },
  { path: "/admin/collab-labs",   label: "Collaborative Labs", icon: "groups"        },
  { path: "/admin/tools",         label: "SOC Tools",          icon: "construction"  },
  { path: "/admin/moderator",     label: "AI Moderator",       icon: "psychology"    },
  { path: "/admin/ai-settings",   label: "AI Settings",        icon: "settings"      },
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
  { path: "/player/team-labs", label: "Team Labs",  icon: "groups"    },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const nav = isAdmin ? adminNav : playerNav;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#090c14] overflow-hidden">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      {/* ════════════ Sidebar ════════════ */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-[linear-gradient(180deg,rgba(22,26,37,.99),rgba(12,15,23,.99))] border-r border-white/[0.08] flex flex-col shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-[264px] lg:flex-shrink-0 lg:translate-x-0 lg:shadow-none ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[linear-gradient(145deg,#356df3,#1d4fcb)] border border-[#83a1ff]/30 flex items-center justify-center shadow-[0_8px_24px_-10px_rgba(53,109,243,.9)]">
              <Icon name="shield_person" filled className="text-xl text-[#b4c5ff]" />
            </div>
            <div>
              <p className="text-sm font-bold text-white tracking-[0.12em] leading-none">ROMULUS</p>
              <p className="text-[9px] text-[#7f8799] uppercase tracking-[0.22em] mt-1.5">SOC Command</p>
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
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Primary">
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
                `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-[linear-gradient(90deg,rgba(53,109,243,.22),rgba(53,109,243,.07))] text-[#c8d5ff] ring-1 ring-[#557ff0]/20 font-semibold shadow-[0_8px_25px_-18px_rgba(53,109,243,.9)]"
                    : "text-[#858b9d] hover:text-[#e1e2ed] hover:bg-white/[0.045]"
                }`
              }
            >
              <Icon name={item.icon} className="text-[18px]" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User block */}
        <div className="p-3 border-t border-white/[0.08]">
          <div className="px-3 py-2.5 mb-2 rounded-xl bg-white/[0.035] border border-white/[0.08]">
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
      <main className="relative flex-1 min-w-0 overflow-y-auto bg-transparent app-workspace">
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
        <div className="relative z-10 page-enter">{children}</div>
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
    <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7 pb-6 border-b border-white/[0.08] after:absolute after:-bottom-px after:left-0 after:w-16 after:h-px after:bg-[#6288f5]">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#6f91ef] mb-2">Operational workspace</p>
        <h1 className="text-2xl sm:text-[28px] font-bold text-[#edf0fa] tracking-[-0.025em] leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[#858b9d] mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0 flex items-center">{action}</div>}
    </div>
  );
}
