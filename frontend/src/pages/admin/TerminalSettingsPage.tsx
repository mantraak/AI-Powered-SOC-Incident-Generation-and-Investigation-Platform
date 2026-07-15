import { useEffect, useState } from "react";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Button, Card, Icon, Input, Spinner } from "../../components/ui";
import type { TerminalSettings } from "../../types";

const fallback: TerminalSettings = {
  enabled: true,
  image: "romulus-terminal-ubuntu:latest",
  default_minutes: 45,
  extension_minutes: 15,
  max_extensions: 2,
  command_timeout_seconds: 20,
  network_enabled: false,
  memory_limit: "256m",
  cpu_quota: 50000,
};

export function TerminalSettingsPage() {
  const [form, setForm] = useState<TerminalSettings>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<TerminalSettings>("/terminal/settings")
      .then((res) => setForm(res.data))
      .catch((err) => setError(err.response?.data?.detail || "Unable to load terminal settings."))
      .finally(() => setLoading(false));
  }, []);

  const setField = (name: keyof TerminalSettings, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const { data } = await api.put<TerminalSettings>("/terminal/settings", form);
      setForm(data);
      setMessage("Terminal settings saved. New sessions will use the updated limits.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to save terminal settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <PageHeader
          title="Terminal Settings"
          subtitle="Configure the player terminal image, duration, extensions and resource limits. The default Romulus image includes vim and nano."
        />

        {loading ? <Spinner /> : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
            <Card>
              <div className="flex items-center gap-2 mb-5 pb-4 border-b border-white/[0.08]">
                <Icon name="terminal" className="text-[#b4c5ff]" />
                <h2 className="font-semibold text-[#e1e2ed]">Runtime policy</h2>
              </div>

              <div className="space-y-5">
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[#e1e2ed]">Enable player terminal</p>
                    <p className="text-xs text-[#858b9d] mt-1">When disabled, players cannot start or execute terminal sessions.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => setField("enabled", event.target.checked)}
                    className="h-5 w-5 accent-[#356df3]"
                  />
                </label>

                <Input
                  label="Docker image"
                  name="image"
                  value={form.image}
                  onChange={(event) => setField("image", event.target.value)}
                  placeholder="romulus-terminal-ubuntu:latest"
                />
                <p className="text-xs text-[#8d90a0] -mt-3">
                  Use <span className="font-mono text-[#c3c6d7]">romulus-terminal-ubuntu:latest</span> to guarantee <span className="font-mono text-[#c3c6d7]">vim</span> and <span className="font-mono text-[#c3c6d7]">nano</span> are available.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input label="Session minutes" name="default_minutes" type="number" value={String(form.default_minutes)} onChange={(e) => setField("default_minutes", Number(e.target.value))} />
                  <Input label="Extension minutes" name="extension_minutes" type="number" value={String(form.extension_minutes)} onChange={(e) => setField("extension_minutes", Number(e.target.value))} />
                  <Input label="Max extensions" name="max_extensions" type="number" value={String(form.max_extensions)} onChange={(e) => setField("max_extensions", Number(e.target.value))} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input label="Command timeout sec" name="command_timeout_seconds" type="number" value={String(form.command_timeout_seconds)} onChange={(e) => setField("command_timeout_seconds", Number(e.target.value))} />
                  <Input label="Memory limit" name="memory_limit" value={form.memory_limit} onChange={(e) => setField("memory_limit", e.target.value)} placeholder="256m" />
                  <Input label="CPU quota" name="cpu_quota" type="number" value={String(form.cpu_quota)} onChange={(e) => setField("cpu_quota", Number(e.target.value))} />
                </div>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
                  <div>
                    <p className="text-sm font-semibold text-[#e1e2ed]">Enable container network</p>
                    <p className="text-xs text-[#858b9d] mt-1">Keep off for safer isolated labs; enable only if your terminal image needs network access.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.network_enabled}
                    onChange={(event) => setField("network_enabled", event.target.checked)}
                    className="h-5 w-5 accent-[#356df3]"
                  />
                </label>

                {message && <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p>}
                {error && <p className="rounded-xl border border-[#93000a]/60 bg-[#93000a]/10 p-3 text-sm text-[#ffb4ab]">{error}</p>}

                <Button onClick={save} disabled={saving}>
                  <Icon name="save" className="text-base" />
                  {saving ? "Saving..." : "Save terminal policy"}
                </Button>
              </div>
            </Card>

            <Card>
              <div className="w-12 h-12 rounded-2xl bg-[#356df3]/15 border border-[#6f91ef]/25 flex items-center justify-center mb-4">
                <Icon name="info" className="text-[#b4c5ff]" />
              </div>
              <h3 className="font-semibold text-[#edf0fa] mb-2">Server requirement</h3>
              <p className="text-sm text-[#a5a9b8] leading-relaxed">
                The backend container must have the Docker socket mounted. This lets Romulus create one isolated terminal container per player.
              </p>
              <div className="mt-4 rounded-xl bg-black/30 border border-white/[0.08] p-3 font-mono text-xs text-[#c3c6d7]">
                /var/run/docker.sock:/var/run/docker.sock
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
