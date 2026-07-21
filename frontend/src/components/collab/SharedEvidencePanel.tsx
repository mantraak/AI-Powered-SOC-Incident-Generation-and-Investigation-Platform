import { useMemo, useState } from "react";
import { Badge, Button, Icon, Input, SectionHeader } from "../ui";
import type { SharedEvidence } from "../../types";
import { labGroupsApi } from "../../api/labGroups";

const typeIcon: Record<string, string> = {
  ioc: "fingerprint",
  event: "event_note",
  artifact: "folder_zip",
  custom: "sticky_note_2",
};

const typeLabel: Record<string, string> = {
  ioc: "IOC",
  event: "Event",
  artifact: "Artifact",
  custom: "Note",
};

export function SharedEvidencePanel({
  evidence,
  currentUserId,
  isAdmin,
  onOpenShare,
  onChanged,
}: {
  evidence: SharedEvidence[];
  currentUserId?: number;
  isAdmin: boolean;
  onOpenShare: () => void;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "owner">("newest");
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let rows = [...evidence];
    if (typeFilter) rows = rows.filter((e) => e.evidence_type === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q) ||
          (e.related_ioc ?? "").toLowerCase().includes(q) ||
          (e.related_mitre_technique ?? "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "newest") rows.sort((a, b) => +new Date(b.shared_at) - +new Date(a.shared_at));
    if (sortBy === "oldest") rows.sort((a, b) => +new Date(a.shared_at) - +new Date(b.shared_at));
    if (sortBy === "owner") rows.sort((a, b) => (a.owner_name ?? "").localeCompare(b.owner_name ?? ""));
    return rows;
  }, [evidence, query, typeFilter, sortBy]);

  const unshare = async (id: number) => {
    if (!confirm("Remove this shared evidence?")) return;
    setBusyId(id);
    try {
      await labGroupsApi.unshareEvidence(id);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        icon="share"
        title="Shared Evidence"
        count={evidence.length}
        action={
          <Button size="sm" variant="secondary" onClick={onOpenShare}>
            <Icon name="ios_share" className="text-sm" /> Share evidence
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-[180px]">
          <Input label="Search" name="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, IOC, MITRE technique…" />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
        >
          <option value="">All types</option>
          <option value="ioc">IOC</option>
          <option value="event">Event</option>
          <option value="artifact">Artifact</option>
          <option value="custom">Note</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3 py-2.5 text-xs text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="owner">By analyst</option>
        </select>
      </div>

      <div className="space-y-2.5">
        {filtered.map((e) => {
          const canUnshare = isAdmin || e.owner_id === currentUserId;
          return (
            <div key={e.id} className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#356df3]/15 ring-1 ring-[#557ff0]/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon name={typeIcon[e.evidence_type] ?? "description"} className="text-sm text-[#b4c5ff]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-[#e1e2ed]">{e.title}</p>
                      <Badge color="gray">{typeLabel[e.evidence_type] ?? e.evidence_type}</Badge>
                    </div>
                    {e.description && <p className="text-[11px] text-[#8d90a0] mt-1">{e.description}</p>}
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[10px] text-[#6f7385]">
                      <span className="flex items-center gap-1"><Icon name="person" className="text-[13px]" /> {e.owner_name ?? `User #${e.owner_id}`}</span>
                      <span>{new Date(e.shared_at).toLocaleString()}</span>
                      {e.related_ioc && <span className="text-[#b4c5ff]">IOC: {e.related_ioc}</span>}
                      {e.related_mitre_technique && <span className="text-[#b4c5ff]">{e.related_mitre_technique}</span>}
                    </div>
                  </div>
                </div>
                {canUnshare && (
                  <button
                    onClick={() => unshare(e.id)}
                    disabled={busyId === e.id}
                    className="text-[#8d90a0] hover:text-[#ffb4ab] w-7 h-7 rounded-lg hover:bg-[#282a32] flex items-center justify-center flex-shrink-0"
                    title="Unshare"
                  >
                    <Icon name="close" className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-[11px] text-[#5a5e6e] text-center py-6">
            {evidence.length === 0 ? "Nothing shared yet - findings stay private until you share them" : "No results match your search"}
          </p>
        )}
      </div>
    </div>
  );
}
