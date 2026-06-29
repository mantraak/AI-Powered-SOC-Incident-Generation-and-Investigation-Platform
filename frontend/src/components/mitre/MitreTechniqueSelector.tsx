import { useEffect, useState } from "react";

import api from "../../api/client";
import type { MitreTactic, MitreTechnique } from "../../types";

interface Props {
  value: string[];
  onChange: (techniqueIds: string[]) => void;
}

export function MitreTechniqueSelector({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [tactic, setTactic] = useState("");
  const [tactics, setTactics] = useState<MitreTactic[]>([]);
  const [results, setResults] = useState<MitreTechnique[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<MitreTactic[]>("/mitre/tactics")
      .then((response) => setTactics(response.data))
      .catch((err) => setError(err.response?.data?.detail || "MITRE catalogue unavailable"));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await api.get<MitreTechnique[]>("/mitre/techniques", {
          params: { q: query, tactic: tactic || undefined, limit: 40 },
        });
        setResults(response.data);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Unable to search MITRE ATT&CK");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, tactic]);

  const add = (techniqueId: string) => {
    if (!value.includes(techniqueId)) onChange([...value, techniqueId]);
  };

  const remove = (techniqueId: string) => {
    onChange(value.filter((item) => item !== techniqueId));
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs text-[#8b949e] font-medium">MITRE ATT&CK Techniques</label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((techniqueId) => (
            <button
              key={techniqueId}
              type="button"
              onClick={() => remove(techniqueId)}
              className="px-2 py-1 rounded border border-purple-700 bg-purple-900/30 text-xs text-purple-300 hover:border-red-600"
              title="Remove technique"
            >
              {techniqueId} ×
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search ID, name, or description"
          className="md:col-span-2 w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
        />
        <select
          value={tactic}
          onChange={(event) => setTactic(event.target.value)}
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500"
        >
          <option value="">All tactics</option>
          {tactics.map((item) => <option key={item.shortname} value={item.shortname}>{item.name}</option>)}
        </select>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="max-h-56 overflow-y-auto border border-[#21262d] rounded-md divide-y divide-[#21262d]">
        {loading ? (
          <p className="p-3 text-xs text-[#8b949e]">Searching ATT&CK...</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-xs text-[#8b949e]">No techniques found.</p>
        ) : results.map((technique) => {
          const selected = value.includes(technique.id);
          return (
            <button
              key={technique.id}
              type="button"
              disabled={selected}
              onClick={() => add(technique.id)}
              className="w-full p-3 text-left hover:bg-[#21262d] disabled:opacity-50 disabled:cursor-default"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#e6edf3]"><span className="font-mono text-purple-300">{technique.id}</span> — {technique.name}</span>
                <span className="text-xs text-cyan-400">{selected ? "Selected" : "Add"}</span>
              </div>
              <p className="text-xs text-[#8b949e] mt-1">{technique.tactics.join(" · ") || "No tactic"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

