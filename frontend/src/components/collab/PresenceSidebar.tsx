import { Icon, SectionHeader } from "../ui";
import type { LabGroupMember, PresenceEntry } from "../../types";

const statusColor: Record<string, string> = {
  online: "bg-emerald-400",
  idle: "bg-amber-400",
  away: "bg-[#8d90a0]",
  offline: "bg-[#434655]",
};

const statusLabel: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  away: "Away",
  offline: "Offline",
};

export function PresenceSidebar({
  members,
  presence,
  currentUserId,
}: {
  members: LabGroupMember[];
  presence: PresenceEntry[];
  currentUserId?: number;
}) {
  const byUser = new Map(presence.map((p) => [p.user_id, p]));
  const sorted = [...members].sort((a, b) => {
    const sa = byUser.get(a.user_id)?.status ?? "offline";
    const sb = byUser.get(b.user_id)?.status ?? "offline";
    const rank = (s: string) => (s === "online" ? 0 : s === "idle" ? 1 : s === "away" ? 2 : 3);
    return rank(sa) - rank(sb);
  });

  return (
    <div>
      <SectionHeader icon="group" title="Presence" count={members.length} />
      <div className="space-y-1.5">
        {sorted.map((m) => {
          const status = byUser.get(m.user_id)?.status ?? "offline";
          return (
            <div
              key={m.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]"
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#2563eb]/25 border border-[#2563eb]/35 flex items-center justify-center text-[11px] font-bold text-[#b4c5ff]">
                  {(m.user_full_name ?? "?").charAt(0).toUpperCase()}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#11131b] ${statusColor[status]}`}
                  title={statusLabel[status]}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#e1e2ed] truncate">
                  {m.user_full_name ?? `User #${m.user_id}`}
                  {m.user_id === currentUserId && <span className="text-[#8d90a0] font-normal"> (you)</span>}
                </p>
                <p className="text-[10px] text-[#8d90a0] capitalize">{m.role.replace("_", " ")}</p>
              </div>
              <Icon
                name={status === "online" ? "wifi" : "wifi_off"}
                className={`text-sm ${status === "online" ? "text-emerald-400" : "text-[#5a5e6e]"}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
