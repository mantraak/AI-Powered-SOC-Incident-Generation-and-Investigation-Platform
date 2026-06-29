import { useCallback, useEffect, useState } from "react";
import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, Spinner, EmptyState, Icon } from "../../components/ui";
import type { SocTool } from "../../types";

const categoryIcon: Record<string, string> = {
  siem:          "monitoring",
  ids:           "radar",
  edr:           "shield_lock",
  ticketing:     "support_agent",
  threat_intel:  "gpp_maybe",
  monitoring:    "monitoring",
  default:       "construction",
};

function iconFor(category: string) {
  const c = category?.toLowerCase().replace(/[^a-z]/g, "_");
  return categoryIcon[c] ?? categoryIcon.default;
}

export function AdminToolsPage() {
  const [tools, setTools] = useState<SocTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTools = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<SocTool[]>("/tools/");
      setTools(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to check the SOC tools.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTools(); }, [loadTools]);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="SOC Tools"
          subtitle="Check availability and launch into the investigation services"
          action={
            <Button variant="secondary" onClick={loadTools} disabled={loading}>
              <Icon name="refresh" className="text-base" />
              Refresh status
            </Button>
          }
        />

        {loading && tools.length === 0 ? (
          <Spinner />
        ) : error ? (
          <Card className="border-[#93000a]/60 bg-[#93000a]/15">
            <p className="text-sm text-[#ffb4ab] flex items-center gap-2">
              <Icon name="error" filled />
              {error}
            </p>
          </Card>
        ) : tools.length === 0 ? (
          <EmptyState icon="construction" title="No SOC tools configured" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <Card key={tool.id} className="flex flex-col min-h-[14rem] hover:border-[#b4c5ff]/30 transition-all">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      tool.status === "online"
                        ? "bg-emerald-500/10 ring-1 ring-emerald-500/30 text-emerald-300"
                        : "bg-[#93000a]/20 ring-1 ring-[#93000a]/40 text-[#ffb4ab]"
                    }`}>
                      <Icon name={iconFor(tool.category)} className="text-xl" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-[#8d90a0] font-semibold">{tool.category}</p>
                      <h2 className="text-base font-semibold text-[#e1e2ed] truncate">{tool.name}</h2>
                    </div>
                  </div>
                  <Badge color={tool.status === "online" ? "green" : "red"}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tool.status === "online" ? "bg-emerald-400 node-pulse" : "bg-[#ffb4ab]"}`} />
                    {tool.status}
                  </Badge>
                </div>

                <p className="text-sm text-[#c3c6d7] flex-1">{tool.description}</p>
                <p className="text-xs text-[#8d90a0] mt-3 mb-3 font-mono">{tool.detail}</p>
                <Button
                  onClick={() => window.open(tool.public_url, "_blank", "noopener,noreferrer")}
                  disabled={tool.status !== "online"}
                  data-testid={`open-tool-${tool.id}`}
                >
                  <Icon name="open_in_new" className="text-base" />
                  Open {tool.name}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
