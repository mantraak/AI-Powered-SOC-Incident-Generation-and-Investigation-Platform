import { useEffect, useState } from "react";
import { Button, Icon, Input, SectionHeader } from "../ui";
import type { LabGroupMember, SharedNote } from "../../types";
import { labGroupsApi } from "../../api/labGroups";

export function SharedNotes({
  groupId,
  notes,
  members,
  currentUserId,
  onChanged,
}: {
  groupId: number;
  notes: SharedNote[];
  members: LabGroupMember[];
  currentUserId?: number;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);

  const memberName = (id: number) => members.find((m) => m.user_id === id)?.user_full_name ?? `User #${id}`;

  const startEdit = async (note: SharedNote) => {
    setConflict(null);
    try {
      await labGroupsApi.lockNote(note.id, "lock");
      setEditingId(note.id);
      setDraft(note.content);
      onChanged();
    } catch (e: any) {
      setConflict(e?.response?.data?.detail ?? "Could not lock note");
    }
  };

  const cancelEdit = async (note: SharedNote) => {
    await labGroupsApi.lockNote(note.id, "unlock").catch(() => {});
    setEditingId(null);
    onChanged();
  };

  const save = async (note: SharedNote) => {
    try {
      await labGroupsApi.updateNote(note.id, draft, note.version);
      setEditingId(null);
      onChanged();
    } catch (e: any) {
      setConflict(e?.response?.data?.detail ?? "Could not save - someone else edited this note");
    }
  };

  const createNote = async () => {
    if (!newContent.trim() && !newTitle.trim()) return;
    await labGroupsApi.createNote(groupId, newTitle.trim() || "Untitled note", newContent);
    setNewTitle("");
    setNewContent("");
    setCreating(false);
    onChanged();
  };

  return (
    <div>
      <SectionHeader
        icon="sticky_note_2"
        title="Shared Analyst Notes"
        count={notes.length}
        action={
          <Button size="sm" variant="secondary" onClick={() => setCreating((s) => !s)}>
            <Icon name="add" className="text-sm" /> New note
          </Button>
        }
      />

      {conflict && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[#2a0a0e] border border-[#93000a]/50 text-[11px] text-[#ffb4ab]">
          {conflict}
        </div>
      )}

      {creating && (
        <div className="mb-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
          <Input label="Title" name="title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Lateral movement timeline" />
          <Input label="Content (markdown)" name="content" value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={4} />
          <Button size="sm" onClick={createNote}>
            <Icon name="check" className="text-sm" /> Add note
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {notes.map((note) => {
          const isEditing = editingId === note.id;
          const lockedByOther = note.locked_by && note.locked_by !== currentUserId;
          return (
            <div key={note.id} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-xs font-semibold text-[#e1e2ed]">{note.title}</p>
                <span className="text-[10px] text-[#6f7385]">v{note.version} · by {memberName(note.author_id)}</span>
              </div>

              {lockedByOther && !isEditing && (
                <p className="text-[10px] text-amber-400 mb-1.5 flex items-center gap-1">
                  <Icon name="edit_note" className="text-xs" /> Currently being edited by {memberName(note.locked_by!)}
                </p>
              )}

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={5}
                    className="w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(note)}>
                      <Icon name="save" className="text-sm" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => cancelEdit(note)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#c3c6d7] whitespace-pre-wrap leading-relaxed">{note.content || "—"}</p>
                  <button
                    disabled={!!lockedByOther}
                    onClick={() => startEdit(note)}
                    className="mt-2 text-[11px] font-semibold text-[#b4c5ff] hover:underline disabled:text-[#5a5e6e] disabled:no-underline"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          );
        })}
        {notes.length === 0 && !creating && (
          <p className="text-[11px] text-[#5a5e6e] text-center py-6">No shared notes yet</p>
        )}
      </div>
    </div>
  );
}
