import { useState } from "react";
import { Button, Icon, SectionHeader } from "../ui";
import type { LabGroupMember } from "../../types";
import { labGroupsApi } from "../../api/labGroups";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  lead_analyst: "Lead Analyst",
  analyst: "Analyst",
  observer: "Observer",
};

export function MembersPanel({
  groupId,
  members,
  canManage,
  currentUserId,
  onOpenInvite,
  onChanged,
}: {
  groupId: number;
  members: LabGroupMember[];
  canManage: boolean;
  currentUserId?: number;
  onOpenInvite: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);

  const changeRole = async (userId: number, role: string) => {
    setBusy(userId);
    try {
      await labGroupsApi.updateMemberRole(groupId, userId, role);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const remove = async (userId: number) => {
    if (!confirm("Remove this analyst from the lab?")) return;
    setBusy(userId);
    try {
      await labGroupsApi.removeMember(groupId, userId);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <SectionHeader
        icon="badge"
        title="Members"
        count={members.length}
        action={
          canManage ? (
            <Button size="sm" variant="secondary" onClick={onOpenInvite}>
              <Icon name="person_add" className="text-sm" /> Invite
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-1.5">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="min-w-0 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#2563eb]/25 border border-[#2563eb]/35 flex items-center justify-center text-[11px] font-bold text-[#b4c5ff] flex-shrink-0">
                {(m.user_full_name ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#e1e2ed] truncate">
                  {m.user_full_name ?? `User #${m.user_id}`}
                  {m.user_id === currentUserId && <span className="text-[#8d90a0] font-normal"> (you)</span>}
                </p>
                <p className="text-[10px] text-[#8d90a0] truncate">{m.user_email}</p>
              </div>
            </div>

            {canManage && m.role !== "owner" ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <select
                  value={m.role}
                  disabled={busy === m.user_id}
                  onChange={(e) => changeRole(m.user_id, e.target.value)}
                  className="bg-[#0b0f18]/90 border border-white/[0.1] rounded-lg px-2 py-1 text-[11px] text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
                >
                  <option value="lead_analyst">Lead Analyst</option>
                  <option value="analyst">Analyst</option>
                  <option value="observer">Observer</option>
                </select>
                <button
                  onClick={() => remove(m.user_id)}
                  disabled={busy === m.user_id}
                  className="w-7 h-7 rounded-lg text-[#8d90a0] hover:text-[#ffb4ab] hover:bg-[#282a32] flex items-center justify-center flex-shrink-0"
                  title="Remove"
                >
                  <Icon name="person_remove" className="text-sm" />
                </button>
              </div>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8d90a0] flex-shrink-0">
                {roleLabels[m.role] ?? m.role}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
