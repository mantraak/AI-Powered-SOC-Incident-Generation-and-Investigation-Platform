import { useEffect, useState } from "react";
import api from "../../api/client";
import { Icon } from "../ui";
import type { MitreTactic, MitreTechnique } from "../../types";

interface Props {
  value: string[];
  onChange: (techniqueIds: string[]) => void;
}

const inputCls =
  "w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none focus:border-[#7f9eff] focus:ring-4 focus:ring-[#356df3]/15 transition-all shadow-inner";

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
    <div className="space-y-2.5">
      <label className="block text-[11px] text-[#8d90a0] font-semibold uppercase tracking-wider">MITRE ATT&amp;CK Techniques</label>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-[#0c0e16] border border-[#434655] rounded-[10px]">
          {value.map((techniqueId) => (
            <button
              key={techniqueId}
              type="button"
              onClick={() => remove(techniqueId)}
              className="px-2 py-1 rounded-md border border-purple-700/50 bg-purple-900/30 text-xs text-purple-300 hover:border-[#ffb4ab] hover:text-[#ffb4ab] transition-colors flex items-center gap-1"
              title="Remove technique"
            >
              {techniqueId}
              <Icon name="close" className="text-xs" />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="relative md:col-span-2">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8d90a0]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ID, name, or description"
            className={`${inputCls} pl-10`}
            data-testid="mitre-search-input"
          />
        </div>
        <select
          value={tactic}
          onChange={(event) => setTactic(event.target.value)}
          className={inputCls}
          data-testid="mitre-tactic-select"
        >
          <option value="">All tactics</option>
          {tactics.map((item) => <option key={item.shortname} value={item.shortname}>{item.name}</option>)}
        </select>
      </div>

      {error && <p className="text-xs text-[#ffb4ab] flex items-center gap-1"><Icon name="error" className="text-xs" />{error}</p>}

      <div className="max-h-60 overflow-y-auto border border-[#434655] rounded-[10px] divide-y divide-[#434655] bg-[#0c0e16]">
        {loading ? (
          <p className="p-3 text-xs text-[#8d90a0] flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-[#434655] border-t-[#b4c5ff] rounded-full animate-spin" />
            Searching ATT&amp;CK…
          </p>
        ) : results.length === 0 ? (
          <p className="p-3 text-xs text-[#8d90a0]">No techniques found.</p>
        ) : results.map((technique) => {
          const selected = value.includes(technique.id);
          return (
            <button
              key={technique.id}
              type="button"
              disabled={selected}
              onClick={() => add(technique.id)}
              className="w-full p-3 text-left hover:bg-[#282a32] disabled:opacity-50 disabled:cursor-default transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[#e1e2ed]">
                  <span className="font-mono text-purple-300">{technique.id}</span> — {technique.name}
                </span>
                <span className={`text-xs flex items-center gap-1 ${selected ? "text-emerald-300" : "text-[#b4c5ff]"}`}>
                  <Icon name={selected ? "check" : "add"} className="text-xs" />
                  {selected ? "Selected" : "Add"}
                </span>
              </div>
              <p className="text-xs text-[#8d90a0] mt-1">{technique.tactics.join(" · ") || "No tactic"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
