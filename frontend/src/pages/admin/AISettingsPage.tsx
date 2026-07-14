import { useEffect, useState } from "react";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, Spinner, Icon } from "../../components/ui";
import type { NewsSettings } from "../../types";

interface AISettings {
  endpoint: string;
  model: string;
  api_key_configured: boolean;
  source: "admin" | "environment";
}

const inputCls =
  "w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] placeholder-[#737888] focus:outline-none focus:border-[#7f9eff] focus:ring-4 focus:ring-[#356df3]/15 transition-all shadow-inner";

/* ═══════════ newsdata.io key for the Threat Feed (admin + player pages) ═══════════ */
function NewsSettingsCard() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<NewsSettings>("/news/settings")
      .then(({ data }) => {
        setConfigured(data.api_key_configured);
        setSource(data.source);
      })
      .catch(() => setSource("none"));
  }, []);

  const save = async () => {
    setSaving(true); setError(""); setMessage("");
    try {
      const { data } = await api.put<NewsSettings>("/news/settings", { api_key: apiKey });
      setConfigured(data.api_key_configured);
      setSource(data.source);
      setApiKey("");
      setMessage("newsdata.io key saved. The Threat Feed is now live for admins and players.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to save the newsdata.io key.");
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setError(""); setMessage("");
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>("/news/settings/test");
      setMessage(`Connection passed: ${data.message}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "newsdata.io connection test failed.");
    } finally { setTesting(false); }
  };

  return (
    <Card className="mt-6">
      <div className="flex items-center gap-2 mb-5 pb-3 border-b border-[#434655]">
        <Icon name="newspaper" className="text-[#b4c5ff]" />
        <h3 className="text-sm font-semibold text-[#e1e2ed]">Threat Feed (newsdata.io)</h3>
        <div className="ml-auto flex items-center gap-2">
          <Badge color={configured ? "green" : "red"}>
            <Icon name={configured ? "check_circle" : "cancel"} className="text-xs" />
            {configured ? "Key configured" : "Key missing"}
          </Badge>
          {source && <Badge color="gray">source: {source}</Badge>}
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">
            newsdata.io API key
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={configured ? "Leave blank to keep the existing key" : "pub_xxxxxxxxxxxxxxxxxxxxx"}
            className={inputCls}
            data-testid="news-apikey-input"
          />
          <p className="text-xs text-[#8d90a0] mt-1">
            Powers the Threat Feed page for both administrators and players. Get a key at newsdata.io.
          </p>
          <p className="text-xs text-amber-300 mt-1 flex items-center gap-1">
            <Icon name="lock" className="text-xs" />
            The saved key is encrypted and is never returned to the browser.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
            <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-emerald-200 text-sm flex items-start gap-2">
            <Icon name="check_circle" filled className="text-base flex-shrink-0 mt-0.5" />
            {message}
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={save} disabled={saving || apiKey.trim().length < 8} data-testid="news-save-btn">
            <Icon name="save" className="text-base" />
            {saving ? "Saving…" : "Save key"}
          </Button>
          <Button variant="secondary" onClick={test} disabled={testing || !configured} data-testid="news-test-btn">
            <Icon name="cable" className="text-base" />
            {testing ? "Testing…" : "Test feed"}
          </Button>
        </div>
      </div>
    </Card>
  );
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
    setSaving(true); setError(""); setMessage("");
    try {
      const { data } = await api.put<AISettings>("/ai-settings/", {
        endpoint, model, api_key: apiKey || null,
      });
      setConfigured(data.api_key_configured);
      setSource(data.source);
      setApiKey("");
      setMessage("AI configuration saved. The API key is encrypted and cannot be displayed.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to save AI settings.");
    } finally { setSaving(false); }
  };

  const test = async () => {
    setTesting(true); setError(""); setMessage("");
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>("/ai-settings/test");
      setMessage(`Connection passed: ${data.message}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "AI connection test failed.");
    } finally { setTesting(false); }
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader
          title="AI Settings"
          subtitle="Configure the chat model endpoint and the newsdata.io key that powers the Threat Feed"
        />

        {loading ? <Spinner /> : (
          <Card>
            <div className="flex items-center gap-2 mb-5 pb-3 border-b border-[#434655]">
              <Icon name="key" className="text-[#b4c5ff]" />
              <h3 className="text-sm font-semibold text-[#e1e2ed]">Connection Status</h3>
              <div className="ml-auto flex items-center gap-2">
                <Badge color={configured ? "green" : "red"}>
                  <Icon name={configured ? "check_circle" : "cancel"} className="text-xs" />
                  {configured ? "Key configured" : "Key missing"}
                </Badge>
                <Badge color="gray">source: {source}</Badge>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Chat completions endpoint</label>
                <input
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                  className={`${inputCls} font-mono text-xs`}
                  data-testid="ai-endpoint-input"
                />
                <p className="text-xs text-[#8d90a0] mt-1">Must use HTTPS and end with /chat/completions.</p>
              </div>

              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">Model identifier</label>
                <input
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="meta/llama-3.3-70b-instruct"
                  className={`${inputCls} font-mono text-xs`}
                  data-testid="ai-model-input"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#8d90a0] font-semibold mb-1.5 uppercase tracking-wider">API key</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={configured ? "Leave blank to keep the existing key" : "Paste a newly generated key"}
                  className={inputCls}
                  data-testid="ai-apikey-input"
                />
                <p className="text-xs text-amber-300 mt-1 flex items-center gap-1">
                  <Icon name="lock" className="text-xs" />
                  The saved key is encrypted and is never returned to the browser.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-[#93000a]/25 border border-[#93000a]/60 rounded-lg text-[#ffb4ab] text-sm flex items-start gap-2">
                  <Icon name="error" filled className="text-base flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              {message && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-emerald-200 text-sm flex items-start gap-2">
                  <Icon name="check_circle" filled className="text-base flex-shrink-0 mt-0.5" />
                  {message}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={save} disabled={saving || !endpoint || !model} data-testid="ai-save-btn">
                  <Icon name="save" className="text-base" />
                  {saving ? "Saving…" : "Save settings"}
                </Button>
                <Button variant="secondary" onClick={test} disabled={testing || !configured} data-testid="ai-test-btn">
                  <Icon name="cable" className="text-base" />
                  {testing ? "Testing…" : "Test saved connection"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {!loading && <NewsSettingsCard />}
      </div>
    </AppLayout>
  );
}
