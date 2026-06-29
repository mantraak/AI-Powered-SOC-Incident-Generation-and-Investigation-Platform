import { useCallback, useEffect, useState } from "react";

import api from "../../api/client";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, Spinner } from "../../components/ui";
import type { SocTool } from "../../types";

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

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader
          title="SOC Tools"
          subtitle="Check availability and open the investigation services"
          action={<Button variant="secondary" onClick={loadTools} disabled={loading}>Refresh status</Button>}
        />

        {loading && tools.length === 0 ? (
          <Spinner />
        ) : error ? (
          <Card className="border-red-900/60">
            <p className="text-sm text-red-400">{error}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tools.map((tool) => (
              <Card key={tool.id} className="flex flex-col min-h-52">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#8b949e]">{tool.category}</p>
                    <h2 className="text-lg font-semibold text-[#e6edf3] mt-1">{tool.name}</h2>
                  </div>
                  <Badge color={tool.status === "online" ? "green" : "red"}>{tool.status}</Badge>
                </div>

                <p className="text-sm text-[#8b949e] flex-1">{tool.description}</p>
                <p className="text-xs text-[#484f58] mt-4 mb-3">{tool.detail}</p>
                <Button
                  onClick={() => window.open(tool.public_url, "_blank", "noopener,noreferrer")}
                  disabled={tool.status !== "online"}
                >
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

