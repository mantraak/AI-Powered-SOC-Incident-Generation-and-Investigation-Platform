import React, { useEffect, useState } from "react";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, Badge, Spinner, EmptyState, Icon } from "../../components/ui";
import api from "../../api/client";
import type { User } from "../../types";
import { useAuth } from "../../store/authContext";

const inputCls =
  "w-full bg-[#0c0e16] border border-[#434655] rounded-[10px] px-3 py-2 text-sm text-[#e1e2ed] placeholder-[#8d90a0] focus:outline-none focus:border-[#b4c5ff] focus:ring-2 focus:ring-[#b4c5ff]/20 transition-colors";

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", role: "player" });
  const [error, setError] = useState("");
  const [generatedCredential, setGeneratedCredential] = useState<{ email: string; password: string } | null>(null);

  const load = () => api.get("/users/").then((r) => setUsers(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const response = await api.post("/users/", form);
      setShowCreate(false);
      setGeneratedCredential({ email: response.data.user.email, password: response.data.temporary_password });
      setForm({ email: "", full_name: "", role: "player" });
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

  const resetPassword = async (user: User) => {
    if (!confirm(`Generate a new password for ${user.full_name}?`)) return;
    const response = await api.post(`/users/${user.id}/reset-password`);
    setGeneratedCredential({ email: user.email, password: response.data.temporary_password });
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Users"
          subtitle={`${users.length} registered accounts on the platform`}
          action={
            <Button onClick={() => setShowCreate(true)} data-testid="add-user-btn">
              <Icon name="person_add" className="text-base" />
              Add User
            </Button>
          }
        />

        {/* Create User Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-[#434655]">
                <h2 className="text-base font-semibold text-[#e1e2ed] flex items-center gap-2">
                  <Icon name="person_add" className="text-[#b4c5ff] text-lg" />
                  Create New User
                </h2>
                <button onClick={() => setShowCreate(false)} className="text-[#8d90a0] hover:text-[#e1e2ed]">
                  <Icon name="close" />
                </button>
              </div>
              {error && (
                <div className="mb-3 p-2.5 bg-[#93000a]/25 border border-[#93000a]/60 rounded text-[#ffb4ab] text-xs">{error}</div>
              )}
              <form onSubmit={handleCreate} className="space-y-3">
                {[
                  { label: "Full Name", key: "full_name", type: "text" },
                  { label: "Email", key: "email", type: "email" },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <label className="text-[11px] text-[#8d90a0] font-semibold mb-1.5 block uppercase tracking-wider">{label}</label>
                    <input
                      type={type}
                      value={(form as any)[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      required
                      className={inputCls}
                    />
                  </div>
                ))}
                <div>
                  <label className="text-[11px] text-[#8d90a0] font-semibold mb-1.5 block uppercase tracking-wider">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className={inputCls}
                  >
                    <option value="player">Player</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-3">
                  <Button type="submit">Create User</Button>
                  <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {generatedCredential && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md shadow-2xl">
              <h2 className="text-base font-semibold text-[#e1e2ed] mb-2">One-time player credentials</h2>
              <p className="text-xs text-[#8d90a0] mb-4">Copy this password now. It will not be shown again.</p>
              <div className="p-3 bg-[#0c0e16] border border-[#434655] rounded-lg font-mono text-sm space-y-2">
                <p className="text-[#c3c6d7]">Username: <span className="text-[#b4c5ff]">{generatedCredential.email}</span></p>
                <p className="text-[#c3c6d7]">Password: <span className="text-[#6ee7b7] break-all">{generatedCredential.password}</span></p>
              </div>
              <Button className="mt-4" onClick={() => setGeneratedCredential(null)}>I copied it</Button>
            </Card>
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState icon="group" title="No users yet" />
        ) : (
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0c0e16] border-b border-[#434655]">
                    {["Name", "Email", "Role", "Status", "Joined", "Actions"].map((h) => (
                      <th key={h} className="text-left text-[11px] text-[#8d90a0] font-semibold py-3 px-4 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-[#434655]/60 last:border-0 hover:bg-[#282a32]/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#2563eb]/25 border border-[#2563eb]/40 flex items-center justify-center text-[#b4c5ff] text-xs font-bold flex-shrink-0">
                            {u.full_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[#e1e2ed] font-medium">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#8d90a0] font-mono text-xs">{u.email}</td>
                      <td className="py-3 px-4">
                        <Badge color={u.role === "admin" ? "purple" : "blue"}>{u.role}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge color={u.is_active ? "green" : "red"}>{u.is_active ? "Active" : "Disabled"}</Badge>
                      </td>
                      <td className="py-3 px-4 text-[#8d90a0] text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4">
                        {u.id !== me?.id ? (
                          <div className="flex gap-1.5 flex-wrap">
                            <button
                              onClick={() => toggleActive(u)}
                              data-testid={`toggle-active-${u.id}`}
                              className="text-xs px-2.5 py-1 rounded-md bg-[#282a32] hover:bg-[#32343d] border border-[#434655] text-[#c3c6d7] transition-colors"
                            >
                              {u.is_active ? "Disable" : "Enable"}
                            </button>
                            {u.role !== "admin" && (
                              <button
                                onClick={() => changeRole(u, "admin")}
                                data-testid={`make-admin-${u.id}`}
                                className="text-xs px-2.5 py-1 rounded-md bg-purple-900/30 hover:bg-purple-900/50 border border-purple-700/50 text-purple-300 transition-colors"
                              >
                                Make Admin
                              </button>
                            )}
                            <button onClick={() => resetPassword(u)} className="text-xs px-2.5 py-1 rounded-md bg-[#282a32] hover:bg-[#32343d] border border-[#434655] text-[#c3c6d7] transition-colors">Reset Password</button>
                            <button
                              onClick={() => handleDelete(u.id)}
                              data-testid={`delete-user-${u.id}`}
                              className="text-xs px-2.5 py-1 rounded-md bg-[#93000a]/25 hover:bg-[#93000a]/45 border border-[#93000a]/60 text-[#ffb4ab] transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#8d90a0] italic">You</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
