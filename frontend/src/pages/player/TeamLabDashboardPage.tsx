import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppLayout, PageHeader } from "../../components/layout/AppLayout";
import { Card, Spinner, Icon, Button, Badge } from "../../components/ui";
import { useAuth } from "../../store/authContext";
import { labGroupsApi } from "../../api/labGroups";
import { useLabGroupSocket } from "../../hooks/useLabGroupSocket";
import { MembersPanel } from "../../components/collab/MembersPanel";
import { PresenceSidebar } from "../../components/collab/PresenceSidebar";
import { TaskBoard } from "../../components/collab/TaskBoard";
import { SharedNotes } from "../../components/collab/SharedNotes";
import { LiveChat } from "../../components/collab/LiveChat";
import { ActivityTimeline } from "../../components/collab/ActivityTimeline";
import { Scoreboard } from "../../components/collab/Scoreboard";
import { SharedEvidencePanel } from "../../components/collab/SharedEvidencePanel";
import { ShareEvidenceModal } from "../../components/collab/ShareEvidenceModal";
import { AssignMemberModal } from "../../components/collab/AssignMemberModal";
import type {
  GroupDashboard, LabGroupMember, LabTask, SharedNote, LabMessage,
  ActivityEntry, PresenceEntry, ScoreboardRow, SharedEvidence,
} from "../../types";

type Tab = "overview" | "tasks" | "notes" | "evidence" | "chat" | "activity" | "scoreboard";

export function TeamLabDashboardPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const { user } = useAuth();

  const [dashboard, setDashboard] = useState<GroupDashboard | null>(null);
  const [members, setMembers] = useState<LabGroupMember[]>([]);
  const [tasks, setTasks] = useState<LabTask[]>([]);
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [messages, setMessages] = useState<LabMessage[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [scoreboard, setScoreboard] = useState<ScoreboardRow[]>([]);
  const [evidence, setEvidence] = useState<SharedEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [showAssign, setShowAssign] = useState(false);
  const [showShareEvidence, setShowShareEvidence] = useState(false);

  const myMembership = members.find((m) => m.user_id === user?.id);
  // Lab administration (assign/remove/re-role members, close/reopen/delete) is
  // Admin-only - enforced on the backend too, this only controls the UI.
  const isAdmin = user?.role === "admin";
  // Task creation/editing stays with Lead Analyst (investigation workflow
  // permission, not lab administration) or Admin.
  const canManageTasks = isAdmin || myMembership?.role === "lead_analyst";

  const refreshAll = useCallback(async () => {
    const [d, m, t, n, c, a, p, s, e] = await Promise.all([
      labGroupsApi.dashboard(groupId),
      labGroupsApi.members(groupId),
      labGroupsApi.tasks(groupId),
      labGroupsApi.notes(groupId),
      labGroupsApi.chat(groupId),
      labGroupsApi.activity(groupId),
      labGroupsApi.presence(groupId),
      labGroupsApi.scoreboard(groupId),
      labGroupsApi.sharedEvidence(groupId),
    ]);
    setDashboard(d);
    setMembers(m);
    setTasks(t);
    setNotes(n);
    setMessages(c);
    setActivity(a);
    setPresence(p);
    setScoreboard(s);
    setEvidence(e);
  }, [groupId]);

  useEffect(() => {
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  const { connected } = useLabGroupSocket(groupId, (evt) => {
    switch (evt.type) {
      case "MemberJoined":
      case "MemberRoleChanged":
        labGroupsApi.members(groupId).then(setMembers);
        break;
      case "MemberLeft":
        setMembers((prev) => prev.filter((m) => m.user_id !== evt.payload.user_id));
        break;
      case "TaskCreated":
      case "TaskUpdated":
      case "TaskCompleted":
        labGroupsApi.tasks(groupId).then(setTasks);
        if (evt.type === "TaskCompleted") labGroupsApi.scoreboard(groupId).then(setScoreboard);
        break;
      case "NoteUpdated":
      case "NoteLockChanged":
        labGroupsApi.notes(groupId).then(setNotes);
        break;
      case "ChatMessage":
        setMessages((prev) => (prev.some((m) => m.id === evt.payload.id) ? prev : [...prev, evt.payload]));
        break;
      case "PresenceChanged":
        setPresence((prev) => {
          const rest = prev.filter((p) => p.user_id !== evt.payload.user_id);
          return [...rest, { user_id: evt.payload.user_id, status: evt.payload.status, last_seen: evt.ts }];
        });
        break;
      case "ActivityCreated":
        labGroupsApi.activity(groupId).then(setActivity);
        labGroupsApi.sharedEvidence(groupId).then(setEvidence);
        break;
      default:
        break;
    }
  });

  if (loading || !dashboard) {
    return (
      <AppLayout>
        <Spinner />
      </AppLayout>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "overview", label: "Overview", icon: "dashboard" },
    { key: "tasks", label: "Tasks", icon: "checklist" },
    { key: "notes", label: "Notes", icon: "sticky_note_2" },
    { key: "evidence", label: "Shared Evidence", icon: "share" },
    { key: "chat", label: "Chat", icon: "forum" },
    { key: "activity", label: "Activity", icon: "history" },
    { key: "scoreboard", label: "Scoreboard", icon: "leaderboard" },
  ];

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-[1500px] mx-auto">
        <PageHeader
          title={dashboard.group.name}
          subtitle={`Collaborative lab · Scenario #${dashboard.group.scenario_id} · ${members.length} analysts`}
        />

        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Badge color={connected ? "green" : "gray"}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1 ${connected ? "bg-emerald-400" : "bg-[#8d90a0]"}`} />
            {connected ? "Live" : "Reconnecting…"}
          </Badge>
          <Badge color={dashboard.group.status === "open" ? "blue" : "gray"}>{dashboard.group.status}</Badge>
          <Link to={`/player/labs`} className="ml-auto">
            <Button size="sm" variant="ghost">
              <Icon name="biotech" className="text-sm" /> My personal investigation
            </Button>
          </Link>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card className="!p-4">
            <p className="text-[10px] uppercase text-[#8d90a0] tracking-wide mb-1">Progress</p>
            <p className="text-xl font-bold text-[#e1e2ed]">{dashboard.progress_pct.toFixed(0)}%</p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] uppercase text-[#8d90a0] tracking-wide mb-1">Open Tasks</p>
            <p className="text-xl font-bold text-[#e1e2ed]">{dashboard.open_tasks}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] uppercase text-[#8d90a0] tracking-wide mb-1">Completed</p>
            <p className="text-xl font-bold text-[#e1e2ed]">{dashboard.completed_tasks}</p>
          </Card>
          <Card className="!p-4">
            <p className="text-[10px] uppercase text-[#8d90a0] tracking-wide mb-1">Online now</p>
            <p className="text-xl font-bold text-[#e1e2ed]">{presence.filter((p) => p.status === "online").length}</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-white/[0.08] overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key ? "border-[#356df3] text-[#e1e2ed]" : "border-transparent text-[#8d90a0] hover:text-[#e1e2ed]"
              }`}
            >
              <Icon name={t.icon} className="text-sm" /> {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">
          <div className="space-y-6 min-w-0">
            {tab === "overview" && (
              <>
                <Card><TaskBoard groupId={groupId} tasks={tasks.slice(0, 6)} members={members} canAssign={canManageTasks} currentUserId={user?.id} onChanged={refreshAll} /></Card>
                <Card><ActivityTimeline activity={activity.slice(0, 8)} /></Card>
              </>
            )}
            {tab === "tasks" && (
              <Card><TaskBoard groupId={groupId} tasks={tasks} members={members} canAssign={canManageTasks} currentUserId={user?.id} onChanged={refreshAll} /></Card>
            )}
            {tab === "notes" && (
              <Card><SharedNotes groupId={groupId} notes={notes} members={members} currentUserId={user?.id} onChanged={refreshAll} /></Card>
            )}
            {tab === "evidence" && (
              <Card>
                <SharedEvidencePanel
                  evidence={evidence}
                  currentUserId={user?.id}
                  isAdmin={isAdmin}
                  onOpenShare={() => setShowShareEvidence(true)}
                  onChanged={refreshAll}
                />
              </Card>
            )}
            {tab === "chat" && (
              <Card>
                <LiveChat
                  groupId={groupId}
                  messages={messages}
                  members={members}
                  currentUserId={user?.id}
                  onSent={(m) => setMessages((prev) => [...prev, m])}
                />
              </Card>
            )}
            {tab === "activity" && <Card><ActivityTimeline activity={activity} /></Card>}
            {tab === "scoreboard" && <Card><Scoreboard rows={scoreboard} /></Card>}
          </div>

          <div className="space-y-6 min-w-0">
            <Card><PresenceSidebar members={members} presence={presence} currentUserId={user?.id} /></Card>
            <Card>
              <MembersPanel
                groupId={groupId}
                members={members}
                canManage={isAdmin}
                currentUserId={user?.id}
                onOpenInvite={() => setShowAssign(true)}
                onChanged={refreshAll}
              />
            </Card>
          </div>
        </div>
      </div>

      {showAssign && (
        <AssignMemberModal groupId={groupId} onClose={() => setShowAssign(false)} onAssigned={refreshAll} />
      )}
      {showShareEvidence && (
        <ShareEvidenceModal
          groupId={groupId}
          onClose={() => setShowShareEvidence(false)}
          onShared={() => { setShowShareEvidence(false); refreshAll(); }}
        />
      )}
    </AppLayout>
  );
}
