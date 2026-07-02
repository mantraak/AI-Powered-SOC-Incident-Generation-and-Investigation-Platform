import React from "react";

/* ════════════════════════ Material Symbol Icon ════════════════════════ */
export function Icon({
  name,
  filled = false,
  className = "",
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={
        filled
          ? { fontVariationSettings: "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24" }
          : undefined
      }
    >
      {name}
    </span>
  );
}

/* ════════════════════════ Badge ════════════════════════ */
export function Badge({
  children,
  color = "gray",
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  const colors: Record<string, string> = {
    blue:    "bg-[#0d1f3d] text-[#b4c5ff] border border-[#2563eb]/40",
    green:   "bg-[#0a2417] text-[#6ee7b7] border border-emerald-700/50",
    red:     "bg-[#2a0a0e] text-[#ffb4ab] border border-[#93000a]/60",
    yellow:  "bg-[#2a1f08] text-[#ffcf76] border border-amber-700/50",
    purple:  "bg-[#1a0e2e] text-[#cbb3ff] border border-purple-700/50",
    cyan:    "bg-[#0d1f2e] text-[#9be9ff] border border-cyan-700/50",
    gray:    "bg-[#282a32] text-[#c3c6d7] border border-[#434655]",
    primary: "bg-[#2563eb]/20 text-[#b4c5ff] border border-[#2563eb]/40",
    error:   "bg-[#93000a]/25 text-[#ffb4ab] border border-[#93000a]/60",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wide ${
        colors[color] ?? colors.gray
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft:             { label: "Draft",         color: "gray"   },
    generating:        { label: "Generating…",   color: "yellow" },
    generated:         { label: "Generated",     color: "blue"   },
    validation_failed: { label: "Failed",        color: "error"  },
    ready:             { label: "Ready",         color: "green"  },
    published:         { label: "Published",     color: "cyan"   },
    assigned:          { label: "Assigned",      color: "blue"   },
    in_progress:       { label: "In Progress",   color: "yellow" },
    submitted:         { label: "Submitted",     color: "purple" },
    evaluated:         { label: "Evaluated",     color: "green"  },
  };
  const { label, color } = map[status] ?? { label: status, color: "gray" };
  return <Badge color={color}>{label}</Badge>;
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const map: Record<string, string> = { beginner: "green", intermediate: "yellow", advanced: "red" };
  return <Badge color={map[difficulty] ?? "gray"}>{difficulty}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = { low: "green", medium: "yellow", high: "red", critical: "error" };
  return (
    <Badge color={map[severity?.toLowerCase?.()] ?? "gray"}>
      {(severity ?? "").toUpperCase()}
    </Badge>
  );
}

/* ════════════════════════ Card ════════════════════════ */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-[#1d1f27]/95 border border-[#434655] rounded-2xl p-5 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.95)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ════════════════════════ Button ════════════════════════ */
export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled = false,
  className = "",
  size = "md",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const variants: Record<string, string> = {
    primary:   "bg-[#2563eb] hover:bg-[#1d4ed8] text-[#eeefff] shadow-[0_2px_8px_-2px_rgba(37,99,235,0.5)]",
    secondary: "bg-[#282a32] hover:bg-[#32343d] text-[#e1e2ed] border border-[#434655]",
    danger:    "bg-[#93000a] hover:bg-red-800 text-[#ffdad6]",
    ghost:     "bg-transparent hover:bg-[#282a32] text-[#8d90a0] hover:text-[#e1e2ed]",
    success:   "bg-emerald-700 hover:bg-emerald-600 text-emerald-50",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b4c5ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#11131b]
        ${variants[variant]} ${sizes[size]}
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        ${className}`}
    >
      {children}
    </button>
  );
}

/* ════════════════════════ Input ════════════════════════ */
export function Input({
  label,
  name,
  type = "text",
  value,
  onChange,
  required = false,
  placeholder = "",
  rows,
}: {
  label: string;
  name: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  const cls =
    "w-full bg-[#0c0e16] border border-[#434655] rounded-[10px] px-3 py-2.5 text-sm text-[#e1e2ed] placeholder-[#8d90a0] focus:outline-none focus:border-[#b4c5ff] focus:ring-2 focus:ring-[#b4c5ff]/20 transition-all";
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wider">
        {label}
      </label>
      {rows ? (
        <textarea name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} rows={rows} className={cls} />
      ) : (
        <input name={name} type={type} value={value} onChange={onChange} required={required} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

/* ════════════════════════ Spinner ════════════════════════ */
export function Spinner() {
  return (
    <div className="flex items-center justify-center p-16">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 border-2 border-[#434655] rounded-full" />
        <div className="absolute inset-0 border-2 border-transparent border-t-[#b4c5ff] rounded-full animate-spin" />
      </div>
    </div>
  );
}

/* ════════════════════════ EmptyState ════════════════════════ */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description?: string;
}) {
  // Accept Material icon names (lowercase letters/underscores) OR emoji
  const isMaterial = typeof icon === "string" && /^[a-z_]+$/.test(icon);
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-[#282a32] border border-[#434655] rounded-2xl flex items-center justify-center mb-5">
        {isMaterial ? (
          <Icon name={icon} className="text-3xl text-[#8d90a0]" />
        ) : (
          <span className="text-3xl" aria-hidden>{icon}</span>
        )}
      </div>
      <h3 className="text-base font-semibold text-[#e1e2ed] mb-1.5">{title}</h3>
      {description && <p className="text-sm text-[#8d90a0] max-w-sm">{description}</p>}
    </div>
  );
}

/* ════════════════════════ SectionHeader ════════════════════════ */
export function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon: string;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="text-[#b4c5ff] text-xl" />
        <h2 className="font-semibold text-[#e1e2ed]">{title}</h2>
        {count !== undefined && (
          <span className="ml-1 text-[11px] bg-[#32343d] text-[#c3c6d7] border border-[#434655] px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
