import React, { useEffect, useRef } from "react";
import { Icon } from "../ui";
import type { ChatMessage } from "../../types";

/* ── Minimal markdown renderer: headings, bullets, code, bold, links ── */
function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="px-1.5 py-0.5 rounded-md bg-[#0b0f18] border border-white/[0.1] text-[#9be9ff] font-mono text-[12px]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key++} className="text-[#edf0fa] font-semibold">{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <a key={key++} href={token} target="_blank" rel="noreferrer" className="text-[#b4c5ff] hover:underline break-all">
          {token}
        </a>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function Markdown({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = content.split(/\r?\n/);
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1.5 my-2">
        {bullets.map((item, index) => (
          <li key={index} className="flex gap-2 text-sm text-[#c3c6d7] leading-relaxed">
            <span className="text-[#6f91ef] flex-shrink-0">▸</span>
            <span>{inline(item)}</span>
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={blocks.length} className="text-[13px] font-semibold text-[#edf0fa] mt-3 mb-1.5 uppercase tracking-wide">
          {inline(heading[2])}
        </p>
      );
      continue;
    }
    blocks.push(
      <p key={blocks.length} className="text-sm text-[#c3c6d7] leading-relaxed my-2">
        {inline(line.replace(/^\s*/, ""))}
      </p>
    );
  }
  flushBullets();
  return <div className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">{blocks}</div>;
}

/* ────────────────────────── Thread ────────────────────────── */
export function ChatThread({
  messages,
  loading,
  emptyState,
  accent = "#356df3",
}: {
  messages: ChatMessage[];
  loading: boolean;
  emptyState: React.ReactNode;
  accent?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

  if (!messages.length && !loading) {
    return <div className="flex-1 overflow-y-auto p-6">{emptyState}</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={index} className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 bg-[linear-gradient(135deg,#3975f6,#2457d6)] border border-[#6d96ff]/30 shadow-[0_8px_22px_-12px_rgba(53,109,243,.9)]">
              <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{message.content}</p>
            </div>
          </div>
        ) : (
          <div key={index} className="flex gap-3">
            <div
              className="w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center border"
              style={{ backgroundColor: `${accent}26`, borderColor: `${accent}66` }}
            >
              <Icon name="smart_toy" className="text-base text-[#b4c5ff]" />
            </div>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md px-4 py-3 bg-white/[0.035] border border-white/[0.08]">
              <Markdown content={message.content} />
              {message.guarded && (
                <p className="mt-3 pt-2 border-t border-white/[0.08] text-[11px] text-amber-300 flex items-center gap-1.5">
                  <Icon name="shield" className="text-xs" />
                  Answer-shaped values were removed from this reply. The mentor will not solve lab questions for you.
                </p>
              )}
              {!!message.searchResults?.length && (
                <details className="mt-3 pt-2 border-t border-white/[0.08]">
                  <summary className="text-[10px] uppercase tracking-wider text-[#8d90a0] font-semibold cursor-pointer hover:text-[#c3c6d7] flex items-center gap-1.5">
                    <Icon name="travel_explore" className="text-sm" />
                    {message.searchResults.length} live web result(s)
                  </summary>
                  <div className="mt-2 space-y-2">
                    {message.searchResults.map((result) => (
                      <a
                        key={result.url}
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-lg px-2.5 py-2 bg-white/[0.03] border border-white/[0.07] hover:border-[#6d96ff]/40 transition-colors"
                      >
                        <p className="text-xs text-[#b4c5ff] font-medium truncate">{result.title}</p>
                        {result.date && <p className="text-[10px] text-[#737888] mt-0.5">{result.date}</p>}
                        <p className="text-[11px] text-[#8d90a0] mt-1 line-clamp-2">{result.snippet}</p>
                      </a>
                    ))}
                  </div>
                </details>
              )}
              {!!message.sources?.length && (
                <div className="mt-3 pt-2 border-t border-white/[0.08] space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-[#8d90a0] font-semibold">Sources read</p>
                  {message.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs text-[#b4c5ff] hover:underline"
                    >
                      <Icon name="link" className="text-xs" />
                      <span className="truncate">{source.title}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {loading && (
        <div className="flex gap-3">
          <div
            className="w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center border"
            style={{ backgroundColor: `${accent}26`, borderColor: `${accent}66` }}
          >
            <Icon name="smart_toy" className="text-base text-[#b4c5ff]" />
          </div>
          <div className="rounded-2xl rounded-tl-md px-4 py-3.5 bg-white/[0.035] border border-white/[0.08] flex items-center gap-1.5">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="w-1.5 h-1.5 rounded-full bg-[#b4c5ff] animate-bounce"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

/* ────────────────────────── Composer ────────────────────────── */
export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#0b0f18]/60">
      <div className="flex items-end gap-2 rounded-2xl bg-[#0b0f18]/90 border border-white/[0.1] px-3 py-2 focus-within:border-[#7f9eff] focus-within:ring-4 focus-within:ring-[#356df3]/15 transition-all">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={placeholder}
          data-testid="assistant-input"
          className="flex-1 bg-transparent resize-none max-h-40 py-1.5 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none"
          style={{ height: "auto" }}
          onInput={(event) => {
            const target = event.currentTarget;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
          }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          data-testid="assistant-send-btn"
          className="mb-0.5 w-9 h-9 flex-shrink-0 rounded-xl bg-[linear-gradient(135deg,#3975f6,#2457d6)] border border-[#6d96ff]/30 text-white flex items-center justify-center transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="send" className="text-lg" />
        </button>
      </div>
      <p className="text-[10px] text-[#737888] mt-2 px-1">
        Enter to send · Shift + Enter for a new line · AI responses can be wrong — verify against your evidence.
      </p>
    </div>
  );
}

export function WebSearchToggle({
  enabled,
  onToggle,
  label = "Search the web",
  hint,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onToggle(!enabled)}
      data-testid="assistant-websearch-toggle"
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
        enabled
          ? "bg-[#2563eb]/15 border-[#2563eb]/40"
          : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]"
      }`}
    >
      <Icon
        name="travel_explore"
        className={`text-lg flex-shrink-0 ${enabled ? "text-[#b4c5ff]" : "text-[#8d90a0]"}`}
      />
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-medium ${enabled ? "text-[#c8d5ff]" : "text-[#c3c6d7]"}`}>
          {label}
        </span>
        {hint && <span className="block text-[10px] text-[#8d90a0] mt-0.5 leading-snug">{hint}</span>}
      </span>
      <span
        className={`w-9 h-5 rounded-full flex-shrink-0 p-0.5 transition-colors ${
          enabled ? "bg-[#356df3]" : "bg-[#434655]"
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export function SuggestionChip({ text, onClick }: { text: string; onClick: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(text)}
      className="text-left text-xs text-[#c3c6d7] bg-white/[0.035] hover:bg-white/[0.08] border border-white/[0.09] hover:border-[#6d96ff]/40 rounded-xl px-3 py-2.5 transition-all"
    >
      {text}
    </button>
  );
}
