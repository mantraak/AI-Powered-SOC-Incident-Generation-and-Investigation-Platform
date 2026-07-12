import { Icon, SectionHeader } from "../ui";
import type { ActivityEntry } from "../../types";

const iconFor: Record<string, string> = {
  group_created: "flag",
  member_joined: "login",
  member_invited: "mail",
  member_left: "logout",
  member_removed: "person_remove",
  member_role_changed: "swap_horiz",
  task_created: "playlist_add",
  task_completed: "task_alt",
  note_added: "note_add",
  note_edited: "edit_note",
  group_closed: "lock",
};

export function ActivityTimeline({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div>
      <SectionHeader icon="history" title="Activity Feed" count={activity.length} />
      <div className="space-y-0">
        {activity.map((a, idx) => (
          <div key={a.id} className="flex gap-3 relative pb-4 last:pb-0">
            {idx < activity.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-white/[0.08]" />
            )}
            <div className="w-8 h-8 rounded-full bg-[#356df3]/15 ring-1 ring-[#557ff0]/25 flex items-center justify-center flex-shrink-0 z-10">
              <Icon name={iconFor[a.action_type] ?? "bolt"} className="text-sm text-[#b4c5ff]" />
            </div>
            <div className="pt-1 min-w-0">
              <p className="text-xs text-[#c3c6d7]">{a.description}</p>
              <p className="text-[10px] text-[#6f7385] mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {activity.length === 0 && <p className="text-[11px] text-[#5a5e6e] text-center py-6">No activity yet</p>}
      </div>
    </div>
  );
}
