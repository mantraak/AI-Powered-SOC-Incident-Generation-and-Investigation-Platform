import { useEffect, useRef, useState } from "react";
import { Icon, SectionHeader } from "../ui";
import type { LabGroupMember, LabMessage } from "../../types";
import { labGroupsApi } from "../../api/labGroups";

export function LiveChat({
  groupId,
  messages,
  members,
  currentUserId,
  onSent,
}: {
  groupId: number;
  messages: LabMessage[];
  members: LabGroupMember[];
  currentUserId?: number;
  onSent: (m: LabMessage) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const memberName = (id: number) => members.find((m) => m.user_id === id)?.user_full_name ?? `User #${id}`;

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const msg = await labGroupsApi.sendMessage(groupId, draft.trim());
      onSent(msg);
      setDraft("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <SectionHeader icon="forum" title="Lab Chat" />
      <div className="flex-1 min-h-[220px] max-h-[360px] overflow-y-auto space-y-2.5 pr-1 mb-3">
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs ${mine ? "bg-[#356df3]/25 border border-[#557ff0]/30 text-[#e1e2ed]" : "bg-white/[0.04] border border-white/[0.07] text-[#c3c6d7]"}`}>
                {!mine && <p className="text-[10px] font-semibold text-[#8d90a0] mb-0.5">{memberName(m.sender_id)}</p>}
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="text-[9px] text-[#6f7385] mt-1">{new Date(m.created_at).toLocaleTimeString()}</p>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-[11px] text-[#5a5e6e] text-center py-6">No messages yet - say hi to the team</p>}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Message the team… use @Name to mention"
          className="flex-1 bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-xs text-[#e1e2ed] placeholder-[#737888] focus:outline-none focus:border-[#7f9eff]"
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          className="w-10 h-10 rounded-xl bg-[linear-gradient(135deg,#3975f6,#2457d6)] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-50"
        >
          <Icon name="send" className="text-lg" />
        </button>
      </div>
    </div>
  );
}
