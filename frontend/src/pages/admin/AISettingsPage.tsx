import { useEffect, useState } from "react";

import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, Spinner } from "../../components/ui";

interface AISettings {
  endpoint: string;
  model: string;
  api_key_configured: boolean;
  source: "admin" | "environment";
}

export function AISettingsPage() {
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<AISettings>("/ai-settings/")
      .then(({ data }) => {
        setEndpoint(data.endpoint);
        setModel(data.model);
        setConfigured(data.api_key_configured);
        setSource(data.source);
      })
      .catch((err) => setError(err.response?.data?.detail || "Unable to load AI settings."))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put<AISettings>("/ai-settings/", {
        endpoint,
        model,
        api_key: apiKey || null,
      });
      setConfigured(data.api_key_configured);
      setSource(data.source);
      setApiKey("");
      setMessage("AI configuration saved. The API key is encrypted and cannot be displayed.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to save AI settings.");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>("/ai-settings/test");
      setMessage(`Connection passed: ${data.message}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "AI connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <PageHeader
          title="AI Settings"
          subtitle="Configure the NVIDIA NIM or another OpenAI-compatible chat endpoint"
        />

        {loading ? <Spinner /> : (
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <Badge color={configured ? "green" : "red"}>{configured ? "key configured" : "key missing"}</Badge>
              <Badge color="gray">source: {source}</Badge>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">Chat completions endpoint</label>
                <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500" />
                <p className="text-xs text-[#484f58] mt-1">Must use HTTPS and end with /chat/completions.</p>
              </div>

              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">Model identifier</label>
                <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="meta/llama-3.3-70b-instruct" className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500" />
              </div>

              <div>
                <label className="block text-xs text-[#8b949e] font-medium mb-1">API key</label>
                <input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? "Leave blank to keep the existing key" : "Paste a newly generated key"} className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-[#e6edf3] focus:outline-none focus:border-cyan-500" />
                <p className="text-xs text-yellow-500 mt-1">The saved key is encrypted and is never returned to the browser.</p>
              </div>

              {error && <div className="p-3 bg-red-900/20 border border-red-800 rounded text-red-400 text-sm">{error}</div>}
              {message && <div className="p-3 bg-green-900/20 border border-green-800 rounded text-green-400 text-sm">{message}</div>}

              <div className="flex gap-3">
                <Button onClick={save} disabled={saving || !endpoint || !model}>{saving ? "Saving..." : "Save settings"}</Button>
                <Button variant="secondary" onClick={test} disabled={testing || !configured}>{testing ? "Testing..." : "Test saved connection"}</Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
