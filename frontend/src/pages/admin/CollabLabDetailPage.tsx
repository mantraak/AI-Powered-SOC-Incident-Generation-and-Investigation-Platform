import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Badge, Button, Card, Icon, Input, Spinner } from "../../components/ui";
import { labGroupsApi } from "../../api/labGroups";
import { MembersPanel } from "../../components/collab/MembersPanel";
import { AssignMemberModal } from "../../components/collab/AssignMemberModal";
import { ActivityTimeline } from "../../components/collab/ActivityTimeline";
import type { GroupDashboard, LabGroupMember, ActivityEntry } from "../../types";

export function AdminCollabLabDetailPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<GroupDashboard | null>(null);
  const [members, setMembers] = useState<LabGroupMember[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    const [d, m, a] = await Promise.all([
      labGroupsApi.dashboard(groupId),
      labGroupsApi.members(groupId),
      labGroupsApi.activity(groupId),
    ]);
    setDashboard(d);
    setMembers(m);
    setActivity(a);
    setName(d.group.name);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const saveName = async () => {
    if (!dashboard || !name.trim() || name === dashboard.group.name) return;
    setSavingName(true);
    try {
      await labGroupsApi.update(groupId, { name: name.trim() });
      load();
    } finally {
      setSavingName(false);
    }
  };

  const toggleStatus = async () => {
    if (!dashboard) return;
    if (dashboard.group.status === "open") await labGroupsApi.update(groupId, { status: "closed" });
    else await labGroupsApi.reopen(groupId);
    load();
  };

  const deleteLab = async () => {
    if (!dashboard) return;
    if (!confirm(`Delete "${dashboard.group.name}"? This removes all members, tasks, notes, chat and shared evidence for this lab. This cannot be undone.`)) return;
    await labGroupsApi.remove(groupId);
    navigate("/admin/collab-labs");
  };

  if (loading || !dashboard) {
    return (
      <AppLayout>
        <Spinner />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <PageHeader title={dashboard.group.name} subtitle={`Scenario #${dashboard.group.scenario_id} · ${members.length} members assigned`} />

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <Badge color={dashboard.group.status === "open" ? "blue" : "gray"}>{dashboard.group.status}</Badge>
          <Button size="sm" variant="secondary" onClick={toggleStatus}>
            <Icon name={dashboard.group.status === "open" ? "lock" : "lock_open"} className="text-sm" />
            {dashboard.group.status === "open" ? "Close lab" : "Reopen lab"}
          </Button>
          <Button size="sm" variant="ghost" onClick={deleteLab}>
            <Icon name="delete" className="text-sm text-[#ffb4ab]" /> Delete lab
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-6 min-w-0">
            <Card>
              <p className="text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wider mb-2">Lab details</p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input label="Lab name" name="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <Button size="sm" onClick={saveName} disabled={savingName || name === dashboard.group.name || !name.trim()}>
                  <Icon name="save" className="text-sm" /> Save
                </Button>
              </div>
            </Card>

            <Card>
              <ActivityTimeline activity={activity} />
            </Card>
          </div>

          <div className="space-y-6 min-w-0">
            <Card>
              <MembersPanel
                groupId={groupId}
                members={members}
                canManage
                onOpenInvite={() => setShowAssign(true)}
                onChanged={load}
              />
            </Card>
          </div>
        </div>
      </div>

      {showAssign && (
        <AssignMemberModal groupId={groupId} onClose={() => setShowAssign(false)} onAssigned={load} />
      )}
    </AppLayout>
  );
}
