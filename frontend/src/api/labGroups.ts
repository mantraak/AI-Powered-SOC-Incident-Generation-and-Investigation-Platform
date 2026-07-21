import api from "./client";
import type {
  LabGroup, LabGroupMember, LabInvitation, LabTask, SharedNote,
  LabMessage, ActivityEntry, PresenceEntry, PersonalProgress,
  ScoreboardRow, GroupDashboard, SharedEvidence, AdminLabGroupList,
} from "../types";

export const labGroupsApi = {
  // Admin-only lifecycle
  create: (scenario_id: number, name: string) =>
    api.post<LabGroup>("/lab-groups", { scenario_id, name }).then((r) => r.data),

  update: (groupId: number, payload: Partial<{ name: string; status: string }>) =>
    api.patch<LabGroup>(`/lab-groups/${groupId}`, payload).then((r) => r.data),

  remove: (groupId: number) => api.delete(`/lab-groups/${groupId}`).then((r) => r.data),

  reopen: (groupId: number) => api.post(`/lab-groups/${groupId}/reopen`).then((r) => r.data),

  adminList: (params: { search?: string; status_filter?: string; page?: number; page_size?: number }) =>
    api.get<AdminLabGroupList>("/lab-groups/admin/list", { params }).then((r) => r.data),

  // Direct admin assignment (no accept/decline round trip)
  assignMember: (groupId: number, user_id: number, role: string = "analyst") =>
    api.post<LabGroupMember>(`/lab-groups/${groupId}/members`, { user_id, role }).then((r) => r.data),

  my: () => api.get<LabGroup[]>("/lab-groups/my").then((r) => r.data),

  get: (groupId: number) => api.get<LabGroup>(`/lab-groups/${groupId}`).then((r) => r.data),

  dashboard: (groupId: number) =>
    api.get<GroupDashboard>(`/lab-groups/${groupId}/dashboard`).then((r) => r.data),

  close: (groupId: number) => api.post(`/lab-groups/${groupId}/close`).then((r) => r.data),

  // Members & invitations
  members: (groupId: number) =>
    api.get<LabGroupMember[]>(`/lab-groups/${groupId}/members`).then((r) => r.data),

  searchUsers: (groupId: number, q: string) =>
    api.get<{ id: number; full_name: string; email: string }[]>(`/lab-groups/${groupId}/search-users`, { params: { q } }).then((r) => r.data),

  invite: (groupId: number, user_id: number, role: string = "analyst") =>
    api.post<LabInvitation>(`/lab-groups/${groupId}/invite`, { user_id, role }).then((r) => r.data),

  invitations: (groupId: number) =>
    api.get<LabInvitation[]>(`/lab-groups/${groupId}/invitations`).then((r) => r.data),

  respondInvitation: (invitationId: number, accept: boolean) =>
    api.post<LabGroupMember | null>(`/lab-groups/invitations/${invitationId}/respond`, { accept }).then((r) => r.data),

  updateMemberRole: (groupId: number, userId: number, role: string) =>
    api.patch<LabGroupMember>(`/lab-groups/${groupId}/members/${userId}`, { role }).then((r) => r.data),

  removeMember: (groupId: number, userId: number) =>
    api.delete(`/lab-groups/${groupId}/members/${userId}`).then((r) => r.data),

  // Activity
  activity: (groupId: number) =>
    api.get<ActivityEntry[]>(`/lab-groups/${groupId}/activity`).then((r) => r.data),

  // Tasks
  tasks: (groupId: number) => api.get<LabTask[]>(`/lab-groups/${groupId}/tasks`).then((r) => r.data),

  createTask: (groupId: number, payload: { title: string; description?: string; mitre_id?: string; assigned_to?: number }) =>
    api.post<LabTask>(`/lab-groups/${groupId}/tasks`, payload).then((r) => r.data),

  updateTask: (taskId: number, payload: Partial<{ title: string; description: string; assigned_to: number; status: string }>) =>
    api.patch<LabTask>(`/lab-groups/tasks/${taskId}`, payload).then((r) => r.data),

  // Notes
  notes: (groupId: number) => api.get<SharedNote[]>(`/lab-groups/${groupId}/notes`).then((r) => r.data),

  createNote: (groupId: number, title: string, content: string) =>
    api.post<SharedNote>(`/lab-groups/${groupId}/notes`, { title, content }).then((r) => r.data),

  updateNote: (noteId: number, content: string, expected_version: number, title?: string) =>
    api.patch<SharedNote>(`/lab-groups/notes/${noteId}`, { content, expected_version, title }).then((r) => r.data),

  lockNote: (noteId: number, action: "lock" | "unlock") =>
    api.post<SharedNote>(`/lab-groups/notes/${noteId}/lock`, { action }).then((r) => r.data),

  noteHistory: (noteId: number) =>
    api.get(`/lab-groups/notes/${noteId}/history`).then((r) => r.data),

  // Chat
  chat: (groupId: number) => api.get<LabMessage[]>(`/lab-groups/${groupId}/chat`).then((r) => r.data),

  sendMessage: (groupId: number, content: string) =>
    api.post<LabMessage>(`/lab-groups/${groupId}/chat`, { content }).then((r) => r.data),

  // Presence
  presence: (groupId: number) => api.get<PresenceEntry[]>(`/lab-groups/${groupId}/presence`).then((r) => r.data),

  // Personal progress
  myProgress: (groupId: number) =>
    api.get<PersonalProgress>(`/lab-groups/${groupId}/progress/me`).then((r) => r.data),

  updateMyProgress: (groupId: number, payload: Partial<{
    add_bookmark: string; remove_bookmark: string; mark_evidence_viewed: string; add_time_spent_seconds: number;
  }>) => api.patch<PersonalProgress>(`/lab-groups/${groupId}/progress/me`, payload).then((r) => r.data),

  // Scoreboard
  scoreboard: (groupId: number) =>
    api.get<ScoreboardRow[]>(`/lab-groups/${groupId}/scoreboard`).then((r) => r.data),

  // Shared evidence
  sharedEvidence: (groupId: number, params: { q?: string; evidence_type?: string } = {}) =>
    api.get<SharedEvidence[]>(`/lab-groups/${groupId}/shared-evidence`, { params }).then((r) => r.data),

  shareEvidence: (groupId: number, payload: {
    evidence_type: string; title: string; description?: string; source?: string;
    related_ioc?: string; related_mitre_technique?: string; evidence_ref_id?: number;
  }) => api.post<SharedEvidence>(`/lab-groups/${groupId}/shared-evidence`, payload).then((r) => r.data),

  unshareEvidence: (evidenceId: number) =>
    api.delete(`/lab-groups/shared-evidence/${evidenceId}`).then((r) => r.data),
};

/** Build the websocket URL for a lab group, reusing the stored JWT. */
export function labGroupSocketUrl(groupId: number): string {
  const token = localStorage.getItem("token") ?? "";
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/api/v1/lab-groups/ws/${groupId}?token=${encodeURIComponent(token)}`;
}
