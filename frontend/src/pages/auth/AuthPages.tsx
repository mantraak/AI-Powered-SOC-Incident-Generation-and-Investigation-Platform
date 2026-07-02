import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../store/authContext";
import { Icon } from "../../components/ui";

function AuthShell({
  heading,
  subheading,
  children,
}: {
  heading: string;
  subheading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-romulus-glow flex items-center justify-center p-4 relative overflow-hidden">
      {/* decorative grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#b4c5ff 1px, transparent 1px), linear-gradient(90deg, #b4c5ff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#2563eb]/15 border border-[#b4c5ff]/30 rounded-2xl mb-4">
            <Icon name="shield_person" filled className="text-3xl text-[#b4c5ff]" />
          </div>
          <h1 className="text-3xl font-bold text-[#e1e2ed] tracking-tight">ROMULUS</h1>
          <p className="text-sm text-[#8d90a0] mt-1.5">{subheading}</p>
        </div>

        <div className="bg-[#1d1f27] border border-[#434655] rounded-[14px] p-6 shadow-2xl shadow-black/40">
          <h2 className="text-base font-semibold text-[#e1e2ed] mb-5 flex items-center gap-2">
            <Icon name="lock" className="text-[#b4c5ff] text-lg" />
            {heading}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-[#0c0e16] border border-[#434655] rounded-[10px] px-3 py-2.5 text-sm text-[#e1e2ed] placeholder-[#8d90a0] focus:outline-none focus:border-[#b4c5ff] focus:ring-2 focus:ring-[#b4c5ff]/20 transition-colors";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      navigate(user.role === "admin" ? "/admin/dashboard" : "/player/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell heading="Sign in to your account" subheading="Incident Investigation Training">
      {error && (
        <div
          data-testid="login-error"
          className="mb-4 p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2"
        >
          <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Email</label>
          <input
            data-testid="login-email-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            placeholder="analyst@soc.local"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Password</label>
          <input
            data-testid="login-password-input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            placeholder="••••••••"
            className={inputCls}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          data-testid="login-submit-btn"
          className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-[#eeefff] font-semibold py-2.5 rounded-md text-sm transition-colors flex items-center justify-center gap-2 shadow-[0_2px_12px_-2px_rgba(37,99,235,0.6)]"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Authenticating…
            </>
          ) : (
            <>
              <Icon name="login" className="text-base" />
              Sign in
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-[#8d90a0]">
        No account?{" "}
        <Link to="/register" className="text-[#b4c5ff] hover:underline font-semibold">Register here</Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", full_name: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          full_name: form.full_name,
          password: form.password,
          role: "player",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || "Registration failed");
      }
      navigate("/login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { label: "Full Name", key: "full_name", type: "text", ph: "Jane Doe" },
    { label: "Email", key: "email", type: "email", ph: "analyst@soc.local" },
    { label: "Password", key: "password", type: "password", ph: "••••••••" },
    { label: "Confirm Password", key: "confirm", type: "password", ph: "••••••••" },
  ];

  return (
    <AuthShell heading="Create account" subheading="Create your analyst account">
      {error && (
        <div
          data-testid="register-error"
          className="mb-4 p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2"
        >
          <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map(({ label, key, type, ph }) => (
          <div key={key}>
            <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">{label}</label>
            <input
              data-testid={`register-${key}-input`}
              type={type}
              value={(form as any)[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              required
              placeholder={ph}
              className={inputCls}
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          data-testid="register-submit-btn"
          className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-[#eeefff] font-semibold py-2.5 rounded-md text-sm transition-colors flex items-center justify-center gap-2 shadow-[0_2px_12px_-2px_rgba(37,99,235,0.6)]"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Creating account…
            </>
          ) : (
            <>
              <Icon name="person_add" className="text-base" />
              Create Account
            </>
          )}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-[#8d90a0]">
        Already have an account?{" "}
        <Link to="/login" className="text-[#b4c5ff] hover:underline font-semibold">Sign in</Link>
      </p>
    </AuthShell>
  );
}
