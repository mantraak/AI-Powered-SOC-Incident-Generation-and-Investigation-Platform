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
    <div className="min-h-screen bg-romulus-glow flex items-center justify-center p-4 lg:p-8 relative overflow-hidden">
      {/* decorative grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#b4c5ff 1px, transparent 1px), linear-gradient(90deg, #b4c5ff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="w-full max-w-5xl relative z-10 grid lg:grid-cols-[1.1fr_.9fr] overflow-hidden rounded-3xl border border-white/[0.1] bg-[#111620]/90 shadow-[0_40px_100px_-40px_rgba(0,0,0,1)] backdrop-blur-xl">
        <section className="hidden lg:flex relative min-h-[620px] p-10 flex-col justify-between overflow-hidden border-r border-white/[0.08] bg-[linear-gradient(145deg,rgba(38,78,183,.28),rgba(12,16,25,.35))]">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#356df3]/20 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#356df3] flex items-center justify-center shadow-lg shadow-blue-950/50">
                <Icon name="shield_person" filled className="text-2xl text-white" />
              </div>
              <div><p className="font-bold tracking-[0.16em] text-white">ROMULUS</p><p className="text-[9px] uppercase tracking-[0.22em] text-[#8ea7e9]">SOC Command Platform</p></div>
            </div>
          </div>
          <div className="relative max-w-md">
            <BadgeLine icon="radar" text="Investigate realistic multi-stage incidents" />
            <BadgeLine icon="account_tree" text="Correlate endpoint, identity and network evidence" />
            <BadgeLine icon="shield_lock" text="Work inside isolated analyst environments" />
            <h2 className="text-4xl font-bold tracking-[-0.04em] text-white mt-8 leading-[1.08]">Train for the signal hidden inside the noise.</h2>
            <p className="text-sm text-[#aeb9d0] mt-4 leading-6">A focused cyber range for practicing investigation, triage and response with real SOC workflows.</p>
          </div>
          <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#71809b]"><span className="w-2 h-2 rounded-full bg-emerald-400 node-pulse" /> Training environment online</div>
        </section>

        <section className="p-6 sm:p-10 lg:p-12 flex flex-col justify-center">
        <div className="text-center lg:text-left mb-8">
          <div className="lg:hidden inline-flex items-center justify-center w-16 h-16 bg-[#2563eb]/15 border border-[#b4c5ff]/30 rounded-2xl mb-4">
            <Icon name="shield_person" filled className="text-3xl text-[#b4c5ff]" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7293ec] font-semibold mb-2">Secure analyst access</p>
          <h1 className="text-3xl font-bold text-[#edf0fa] tracking-tight">{heading}</h1>
          <p className="text-sm text-[#858b9d] mt-2">{subheading}</p>
        </div>

        <div>
          {children}
        </div>
        </section>
      </div>
    </div>
  );
}

function BadgeLine({ icon, text }: { icon: string; text: string }) {
  return <div className="flex items-center gap-3 py-2 text-sm text-[#cbd4e8]"><span className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center"><Icon name={icon} className="text-[#91adfa]" /></span>{text}</div>;
}

const inputCls =
  "w-full bg-[#0b0f18] border border-white/[0.1] rounded-xl px-3.5 py-3 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none focus:border-[#7f9eff] focus:ring-4 focus:ring-[#356df3]/15 transition-all";

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
          className="w-full bg-[linear-gradient(135deg,#3975f6,#2457d6)] hover:brightness-110 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-[0_10px_25px_-12px_rgba(53,109,243,.9)]"
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
          className="w-full bg-[linear-gradient(135deg,#3975f6,#2457d6)] hover:brightness-110 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-[0_10px_25px_-12px_rgba(53,109,243,.9)]"
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
