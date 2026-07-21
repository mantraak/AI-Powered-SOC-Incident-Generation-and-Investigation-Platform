import { SectionHeader } from "../ui";
import type { ScoreboardRow } from "../../types";

export function Scoreboard({ rows }: { rows: ScoreboardRow[] }) {
  const sorted = [...rows].sort((a, b) => b.total_score - a.total_score);

  return (
    <div>
      <SectionHeader icon="leaderboard" title="Scoreboard" count={rows.length} />
      <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-white/[0.03] text-[#8d90a0] uppercase tracking-wide text-[10px]">
              <th className="text-left px-3 py-2.5 font-semibold">Analyst</th>
              <th className="text-right px-3 py-2.5 font-semibold">Tasks</th>
              <th className="text-right px-3 py-2.5 font-semibold">Evidence</th>
              <th className="text-right px-3 py-2.5 font-semibold">Questions</th>
              <th className="text-right px-3 py-2.5 font-semibold">Accuracy</th>
              <th className="text-right px-3 py-2.5 font-semibold">Time</th>
              <th className="text-right px-3 py-2.5 font-semibold">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => (
              <tr key={r.user_id} className="border-t border-white/[0.05]">
                <td className="px-3 py-2.5 text-[#e1e2ed] font-medium">
                  {idx === 0 && r.total_score > 0 ? "🥇 " : ""}
                  {r.full_name}
                  <span className="text-[#8d90a0] font-normal capitalize"> · {r.role.replace("_", " ")}</span>
                </td>
                <td className="px-3 py-2.5 text-right text-[#c3c6d7]">{r.tasks_completed}</td>
                <td className="px-3 py-2.5 text-right text-[#c3c6d7]">{r.evidence_viewed}</td>
                <td className="px-3 py-2.5 text-right text-[#c3c6d7]">{r.questions_solved}</td>
                <td className="px-3 py-2.5 text-right text-[#c3c6d7]">{r.accuracy.toFixed(0)}%</td>
                <td className="px-3 py-2.5 text-right text-[#c3c6d7]">{Math.round(r.time_spent_seconds / 60)}m</td>
                <td className="px-3 py-2.5 text-right text-[#b4c5ff] font-semibold">{r.total_score.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="text-[11px] text-[#5a5e6e] text-center py-6">No scores yet</p>}
      </div>
    </div>
  );
}
