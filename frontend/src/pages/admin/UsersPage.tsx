import React, { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, Badge, Spinner, EmptyState } from "../../components/ui";
import api from "../../api/client";
import type { User } from "../../types";
import { useAuth } from "../../store/authContext";

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "", role: "player" });
  const [error, setError] = useState("");

  const load = () => api.get("/users/").then((r) => setUsers(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/register", form);
      setShowCreate(false);
      setForm({ email: "", full_name: "", password: "", role: "player" });
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create user");
    }
  };

  const toggleActive = async (user: User) => {
    await api.put(`/users/${user.id}`, { is_active: !user.is_active });
    load();
  };

  const changeRole = async (user: User, role: string) => {
    await api.put(`/users/${user.id}`, { role });
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    await api.delete(`/users/${id}`);
    load();
  };

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader
          title="Users"
          subtitle={`${users.length} registered users`}
          action={<Button onClick={() => setShowCreate(true)}>➕ Add User</Button>}
        />

        {/* Create User Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <h2 className="text-base font-semibold text-[#e6edf3] mb-4">Create New User</h2>
              {error && <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded text-red-400 text-xs">{error}</div>}
              <form onSubmit={handleCreate} className="space-y-3">
                {[
                  { label: "Full Name", key: "full_name", type: "text" },
                  { label: "Email", key: "email", type: "email" },
                  { label: "Password", key: "password", type: "password" },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <label className="text-xs text-[#8b949e] mb-1 block">{label}</label>
                    <input type={type} value={(form as any)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      required
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500" />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-[#8b949e] mb-1 block">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500">
                    <option value="player">Player</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit">Create User</Button>
                  <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {loading ? <Spinner /> : users.length === 0 ? (
          <EmptyState icon="👥" title="No users yet" />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#21262d]">
                  {["Name", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs text-[#8b949e] font-medium py-2 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[#21262d] last:border-0 hover:bg-[#21262d]/30">
                    <td className="py-3 px-3 text-[#e6edf3] font-medium">{u.full_name}</td>
                    <td className="py-3 px-3 text-[#8b949e]">{u.email}</td>
                    <td className="py-3 px-3">
                      <Badge color={u.role === "admin" ? "purple" : "blue"}>{u.role}</Badge>
                    </td>
                    <td className="py-3 px-3">
                      <Badge color={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Disabled"}</Badge>
                    </td>
                    <td className="py-3 px-3 text-[#8b949e] text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-3">
                      {u.id !== me?.id && (
                        <div className="flex gap-1">
                          <button onClick={() => toggleActive(u)}
                            className="text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] text-[#8b949e] transition-colors">
                            {u.is_active ? "Disable" : "Enable"}
                          </button>
                          {u.role !== "admin" && (
                            <button onClick={() => changeRole(u, "admin")}
                              className="text-xs px-2 py-1 rounded bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 transition-colors">
                              Make Admin
                            </button>
                          )}
                          <button onClick={() => handleDelete(u.id)}
                            className="text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors">
                            Delete
                          </button>
                        </div>
                      )}
                      {u.id === me?.id && <span className="text-xs text-[#8b949e]">You</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
