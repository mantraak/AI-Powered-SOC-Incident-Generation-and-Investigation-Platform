import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, StatusBadge, Spinner, EmptyState, Button } from "../../components/ui";
import api from "../../api/client";
import type { Lab } from "../../types";

export function PlayerLabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/labs/my").then((r) => setLabs(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="p-6">
        <PageHeader title="My Labs" subtitle={`${labs.length} assigned`} />

        {loading ? <Spinner /> : labs.length === 0 ? (
          <EmptyState icon="🧪" title="No labs assigned" description="Your instructor will assign incident investigation labs to you." />
        ) : (
          <div className="space-y-3">
            {labs.map((lab) => (
              <Card key={lab.id} className="hover:border-[#30363d] transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-base font-semibold text-[#e6edf3]">
                        Lab #{lab.id}
                      </span>
                      <StatusBadge status={lab.status} />
                    </div>
                    <p className="text-xs text-[#8b949e]">
                      Scenario #{lab.scenario_id}
                      {lab.started_at && ` · Started ${new Date(lab.started_at).toLocaleDateString()}`}
                      {lab.submitted_at && ` · Submitted ${new Date(lab.submitted_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Link to={`/player/labs/${lab.id}`}>
                    <Button variant={lab.status === "assigned" ? "primary" : "secondary"} size="sm">
                      {lab.status === "assigned" ? "Start" : lab.status === "in_progress" ? "Continue" : "Review"}
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
