import { useEffect, useState } from "react";
import { Button, Icon, Input } from "../ui";
import { labGroupsApi } from "../../api/labGroups";

interface FoundUser {
  id: number;
  full_name: string;
  email: string;
}

export function AssignMemberModal({
  groupId,
  onClose,
  onAssigned,
}: {
  groupId: number;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [role, setRole] = useState("analyst");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      labGroupsApi.searchUsers(groupId, query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [groupId, query]);

  const assign = async (userId: number) => {
    setBusyId(userId);
    setError(null);
    try {
      await labGroupsApi.assignMember(groupId, userId, role);
      onAssigned();
      setResults((r) => r.filter((u) => u.id !== userId));
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Could not assign user");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[linear-gradient(145deg,rgba(29,33,45,.98),rgba(19,22,31,.98))] border border-white/[0.1] rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#e1e2ed] flex items-center gap-2">
            <Icon name="person_add" className="text-[#b4c5ff]" /> Assign Members
          </h3>
          <button onClick={onClose} className="text-[#8d90a0] hover:text-[#e1e2ed]">
            <Icon name="close" />
          </button>
        </div>

        <Input label="Search by name or email" name="query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. jane@company.com" />

        <div className="mt-3">
          <label className="text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wider">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1.5 w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
          >
            <option value="lead_analyst">Lead Analyst</option>
            <option value="analyst">Analyst</option>
            <option value="observer">Observer</option>
          </select>
        </div>

        {error && <p className="mt-3 text-xs text-[#ffb4ab]">{error}</p>}

        <div className="mt-4 max-h-64 overflow-y-auto space-y-1.5">
          {results.length === 0 && (
            <p className="text-xs text-[#8d90a0] py-4 text-center">
              {query ? "No matching users" : "Type to search for people to assign"}
            </p>
          )}
          {results.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#e1e2ed] truncate">{u.full_name}</p>
                <p className="text-[10px] text-[#8d90a0] truncate">{u.email}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => assign(u.id)}>
                <Icon name="add" className="text-sm" /> Assign
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
