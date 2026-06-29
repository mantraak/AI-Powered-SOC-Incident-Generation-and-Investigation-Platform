import React from "react";

export function Badge({
  children,
  color = "blue",
  className = "",
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-900/40 text-blue-300 border border-blue-700",
    green: "bg-green-900/40 text-green-300 border border-green-700",
    red: "bg-red-900/40 text-red-300 border border-red-700",
    yellow: "bg-yellow-900/40 text-yellow-300 border border-yellow-700",
    purple: "bg-purple-900/40 text-purple-300 border border-purple-700",
    gray: "bg-gray-800 text-gray-400 border border-gray-700",
    cyan: "bg-cyan-900/40 text-cyan-300 border border-cyan-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[color] || colors.gray} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "gray" },
    generating: { label: "Generating...", color: "yellow" },
    generated: { label: "Generated", color: "blue" },
    validation_failed: { label: "Failed", color: "red" },
    ready: { label: "Ready", color: "green" },
    published: { label: "Published", color: "cyan" },
    assigned: { label: "Assigned", color: "blue" },
    in_progress: { label: "In Progress", color: "yellow" },
    submitted: { label: "Submitted", color: "purple" },
    evaluated: { label: "Evaluated", color: "green" },
  };
  const { label, color } = map[status] || { label: status, color: "gray" };
  return <Badge color={color}>{label}</Badge>;
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const map: Record<string, string> = { beginner: "green", intermediate: "yellow", advanced: "red" };
  return <Badge color={map[difficulty] || "gray"}>{difficulty}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = { low: "green", medium: "yellow", high: "red", critical: "red" };
  return <Badge color={map[severity] || "gray"}>{severity.toUpperCase()}</Badge>;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#161b22] border border-[#21262d] rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children, onClick, variant = "primary", type = "button", disabled = false, className = "", size = "md"
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const variants = {
    primary: "bg-cyan-600 hover:bg-cyan-500 text-white",
    secondary: "bg-[#21262d] hover:bg-[#30363d] text-[#e6edf3] border border-[#30363d]",
    danger: "bg-red-700 hover:bg-red-600 text-white",
    ghost: "bg-transparent hover:bg-[#21262d] text-[#8b949e] hover:text-white",
    success: "bg-green-700 hover:bg-green-600 text-white",
  };
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-md font-medium transition-colors
        ${variants[variant]} ${sizes[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  label, name, type = "text", value, onChange, required = false, placeholder = "", rows
}: {
  label: string; name: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  required?: boolean; placeholder?: string; rows?: number;
}) {
  const cls = "w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500";
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#8b949e] font-medium uppercase tracking-wide">{label}</label>
      {rows ? (
        <textarea name={name} value={value} onChange={onChange} required={required} placeholder={placeholder} rows={rows} className={cls} />
      ) : (
        <input name={name} type={type} value={value} onChange={onChange} required={required} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-8 h-8 border-2 border-[#21262d] border-t-cyan-500 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: string; title: string; description?: string }) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-[#e6edf3] mb-2">{title}</h3>
      {description && <p className="text-sm text-[#8b949e]">{description}</p>}
    </div>
  );
}
