import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, StatusBadge, Spinner, EmptyState, Button, Icon } from "../../components/ui";
import api from "../../api/client";
import type { Lab } from "../../types";

const actionLabels: Record<string, { label: string; icon: string; variant: "primary" | "secondary" }> = {
  assigned:    { label: "Start",    icon: "play_arrow",     variant: "primary"   },
  in_progress: { label: "Continue", icon: "play_circle",    variant: "primary"   },
  submitted:   { label: "Review",   icon: "visibility",     variant: "secondary" },
  evaluated:   { label: "Review",   icon: "visibility",     variant: "secondary" },
};

export function PlayerLabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/labs/my").then((r) => setLabs(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader title="My Labs" subtitle={`${labs.length} assigned · Track your investigations`} />

        {loading ? (
          <Spinner />
        ) : labs.length === 0 ? (
          <EmptyState icon="biotech" title="No labs assigned" description="Your instructor will assign incident investigation labs to you." />
        ) : (
          <div className="space-y-3">
            {labs.map((lab) => {
              const action = actionLabels[lab.status] ?? actionLabels.assigned;
              return (
                <Card key={lab.id} className="hover:border-[#b4c5ff]/30 transition-all">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-lg bg-[#2563eb]/15 ring-1 ring-[#2563eb]/30 flex items-center justify-center flex-shrink-0">
                        <Icon name="science" filled className="text-xl text-[#b4c5ff]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <span className="text-base font-semibold text-[#e1e2ed]">Lab #{lab.id}</span>
                          <StatusBadge status={lab.status} />
                        </div>
                        <p className="text-xs text-[#8d90a0]">
                          Scenario #{lab.scenario_id}
                          {lab.started_at && ` · Started ${new Date(lab.started_at).toLocaleDateString()}`}
                          {lab.submitted_at && ` · Submitted ${new Date(lab.submitted_at).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Link to={`/player/labs/${lab.id}`} data-testid={`open-lab-${lab.id}-btn`} className="flex-shrink-0">
                      <Button variant={action.variant} size="sm">
                        <Icon name={action.icon} className="text-base" />
                        {action.label}
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
