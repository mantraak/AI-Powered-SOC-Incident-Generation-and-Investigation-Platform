import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../store/authContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(form.email, form.password);

      const user = JSON.parse(localStorage.getItem("user") || "{}");

      navigate(
        user.role === "admin"
          ? "/admin/dashboard"
          : "/player/dashboard"
      );
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "Login failed. Check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🛡️</div>
          <h1 className="text-2xl font-bold text-[#e6edf3]">
            AI SOC Platform
          </h1>
          <p className="text-sm text-[#8b949e] mt-1">
            Incident Investigation Training
          </p>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[#e6edf3] mb-5">
            Sign in
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-md text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8b949e] font-medium mb-1">
                Email
              </label>

              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                required
                placeholder="you@example.com"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8b949e] font-medium mb-1">
                Password
              </label>

              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                required
                placeholder="••••••••"
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium py-2 rounded-md text-sm transition-colors"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[#8b949e]">
            No account?{" "}
            <Link
              to="/register"
              className="text-cyan-400 hover:underline"
            >
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    confirm: "",
  });

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
        headers: {
          "Content-Type": "application/json",
        },
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

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🛡️</div>

          <h1 className="text-2xl font-bold text-[#e6edf3]">
            AI SOC Platform
          </h1>

          <p className="text-sm text-[#8b949e] mt-1">
            Create your analyst account
          </p>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-[#e6edf3] mb-5">
            Register
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-md text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              {
                label: "Full Name",
                key: "full_name",
                type: "text",
                ph: "John Doe",
              },
              {
                label: "Email",
                key: "email",
                type: "email",
                ph: "you@example.com",
              },
              {
                label: "Password",
                key: "password",
                type: "password",
                ph: "••••••••",
              },
              {
                label: "Confirm Password",
                key: "confirm",
                type: "password",
                ph: "••••••••",
              },
            ].map(({ label, key, type, ph }) => (
              <div key={key}>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">
                  {label}
                </label>

                <input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      [key]: e.target.value,
                    })
                  }
                  required
                  placeholder={ph}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-cyan-500"
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium py-2 rounded-md text-sm transition-colors"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-[#8b949e]">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-cyan-400 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
