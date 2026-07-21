import { useState } from "react";
import { Button, Icon, Input, SectionHeader } from "../ui";
import type { LabGroupMember, LabTask, TaskStatus } from "../../types";
import { labGroupsApi } from "../../api/labGroups";

const columns: { key: TaskStatus; label: string; icon: string }[] = [
  { key: "pending", label: "Pending", icon: "radio_button_unchecked" },
  { key: "in_progress", label: "In Progress", icon: "autorenew" },
  { key: "completed", label: "Completed", icon: "task_alt" },
];

export function TaskBoard({
  groupId,
  tasks,
  members,
  canAssign,
  currentUserId,
  onChanged,
}: {
  groupId: number;
  tasks: LabTask[];
  members: LabGroupMember[];
  canAssign: boolean;
  currentUserId?: number;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const memberName = (id?: number) => members.find((m) => m.user_id === id)?.user_full_name ?? "Unassigned";

  const createTask = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await labGroupsApi.createTask(groupId, {
        title: title.trim(),
        description: description.trim() || undefined,
        assigned_to: assignedTo ? Number(assignedTo) : undefined,
      });
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setShowForm(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (taskId: number, status: TaskStatus) => {
    await labGroupsApi.updateTask(taskId, { status });
    onChanged();
  };

  return (
    <div>
      <SectionHeader
        icon="checklist"
        title="Task Board"
        count={tasks.length}
        action={
          canAssign ? (
            <Button size="sm" variant="secondary" onClick={() => setShowForm((s) => !s)}>
              <Icon name="add" className="text-sm" /> New task
            </Button>
          ) : undefined
        }
      />

      {showForm && (
        <div className="mb-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
          <Input label="Task" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Investigate PowerShell activity" />
          <Input label="Details" name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional context or MITRE technique reference" />
          <div>
            <label className="text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wider">Assign to</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="mt-1.5 w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.user_full_name}</option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={createTask} disabled={saving || !title.trim()}>
            <Icon name="check" className="text-sm" /> Create task
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {columns.map((col) => (
          <div key={col.key} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-2.5">
            <div className="flex items-center gap-1.5 mb-2 px-1 text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wide">
              <Icon name={col.icon} className="text-sm" /> {col.label}
              <span className="ml-auto">{tasks.filter((t) => t.status === col.key).length}</span>
            </div>
            <div className="space-y-2">
              {tasks.filter((t) => t.status === col.key).map((t) => {
                const isAssignee = t.assigned_to === currentUserId;
                const canMove = canAssign || isAssignee;
                return (
                  <div key={t.id} className="p-2.5 rounded-lg bg-[#12141d] border border-white/[0.07]">
                    <p className="text-xs font-semibold text-[#e1e2ed]">{t.title}</p>
                    {t.description && <p className="text-[11px] text-[#8d90a0] mt-1">{t.description}</p>}
                    <p className="text-[10px] text-[#6f7385] mt-1.5 flex items-center gap-1">
                      <Icon name="person" className="text-[13px]" /> {memberName(t.assigned_to)}
                    </p>
                    {canMove && col.key !== "completed" && (
                      <div className="flex gap-1.5 mt-2">
                        {col.key === "pending" && (
                          <button onClick={() => setStatus(t.id, "in_progress")} className="text-[10px] font-semibold text-[#b4c5ff] hover:underline">
                            Start
                          </button>
                        )}
                        {col.key === "in_progress" && (
                          <button onClick={() => setStatus(t.id, "completed")} className="text-[10px] font-semibold text-emerald-400 hover:underline">
                            Mark complete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {tasks.filter((t) => t.status === col.key).length === 0 && (
                <p className="text-[11px] text-[#5a5e6e] text-center py-4">Nothing here</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
