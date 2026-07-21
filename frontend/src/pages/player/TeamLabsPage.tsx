import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Button, Icon, Spinner, EmptyState, Badge } from "../../components/ui";
import { labGroupsApi } from "../../api/labGroups";
import type { LabGroup } from "../../types";

// Analysts can only VIEW labs an Admin has assigned them to - lab creation
// and membership management live in the Admin Dashboard -> Collaborative
// Labs (see pages/admin/CollabLabsPage.tsx). This is enforced on the backend
// too (POST /lab-groups requires an Admin), not just hidden here.
export function TeamLabsPage() {
  const [groups, setGroups] = useState<LabGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    labGroupsApi.my().then(setGroups).finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <PageHeader
          title="Team Labs"
          subtitle="Collaborative investigations you've been assigned to - shared evidence, independent progress"
        />

        {loading ? (
          <Spinner />
        ) : groups.length === 0 ? (
          <EmptyState
            icon="groups"
            title="No collaborative labs assigned yet"
            description="An Admin assigns analysts to collaborative labs. Once you're added to one, it will show up here."
          />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {groups.map((g) => (
              <Card key={g.id} className="group hover:border-[#6f91ef]/30 hover:-translate-y-0.5 transition-all">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-[#356df3]/15 ring-1 ring-[#557ff0]/25 flex items-center justify-center flex-shrink-0">
                      <Icon name="groups" filled className="text-xl text-[#b4c5ff]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="text-base font-semibold text-[#e1e2ed] truncate">{g.name}</span>
                        <Badge color={g.status === "open" ? "blue" : "gray"}>{g.status}</Badge>
                      </div>
                      <p className="text-xs text-[#8d90a0]">Scenario #{g.scenario_id}</p>
                    </div>
                  </div>
                  <Link to={`/player/team-labs/${g.id}`} className="flex-shrink-0">
                    <Button size="sm">
                      <Icon name="login" className="text-base" /> Enter
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
