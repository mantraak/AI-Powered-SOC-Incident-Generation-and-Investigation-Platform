export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "player";
  is_active: boolean;
  created_at: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

export interface Scenario {
  id: number;
  title: string;
  description?: string;
  article_text?: string;
  mitre_techniques: string[];
  iocs: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  num_questions: number;
  status: "draft" | "generating" | "generated" | "validation_failed" | "ready" | "published";
  created_by?: number;
  attack_steps?: any[];
  timeline?: any[];
  assets?: any[];
  summary?: string;
  created_at: string;
}

export interface Lab {
  id: number;
  player_id: number;
  scenario_id: number;
  status: "assigned" | "in_progress" | "submitted" | "evaluated";
  started_at?: string;
  submitted_at?: string;
  notes?: string;
  created_at: string;
}

export interface Question {
  id: number;
  order: number;
  question_text: string;
  question_type: string;
  choices: string[];
  points: number;
  hint?: string;
}

export interface PlayerAnswer {
  id: number;
  question_id: number;
  lab_id: number;
  answer_text: string;
  is_correct?: boolean;
  points_awarded: number;
  feedback?: string;
  created_at: string;
}

export interface Alert {
  id: number;
  title: string;
  severity: string;
  description: string;
  mitre_id?: string;
  rule_name?: string;
}

export interface Indicator {
  id: number;
  ioc_type: string;
  value: string;
  description: string;
  mitre_id?: string;
}

export interface ScenarioEvent {
  id: number;
  event_type: string;
  source: string;
  host: string;
  user: string;
  message: string;
  mitre_id?: string;
  timestamp: string;
}

export interface Artifact {
  id: number;
  name: string;
  artifact_type: string;
  host: string;
  content: string;
}

export interface Score {
  id: number;
  player_id: number;
  lab_id: number;
  scenario_id: number;
  question_score: number;
  containment_score: number;
  total_score: number;
  max_possible: number;
  grade?: string;
  feedback?: string;
  created_at: string;
}

export interface LabArchiveSummary {
  lab_id: number;
  scenario_id: number;
  title: string;
  difficulty: "beginner" | "intermediate" | "advanced" | string;
  status: "submitted" | "evaluated" | string;
  started_at?: string;
  submitted_at?: string;
  created_at: string;
  score?: Partial<Score> | null;
  percent: number;
  answered_questions: number;
  correct_answers: number;
  total_questions: number;
  mitre_techniques: string[];
  summary?: string;
}

export interface LabArchiveDetail {
  summary: LabArchiveSummary;
  scenario: Scenario;
  score?: Partial<Score> | null;
  investigation_path: Array<{
    step: number;
    title: string;
    description: string;
    player_action?: string;
    outcome: "correct" | "needs_review" | string;
    feedback?: string;
    evidence?: string;
    points_awarded: number;
    time?: string;
  }>;
  question_review: Array<{
    question_id: number;
    order: number;
    question_text: string;
    question_type: string;
    points: number;
    hint?: string;
    player_answer?: string;
    is_correct?: boolean | null;
    points_awarded: number;
    feedback?: string;
    attached_evidence?: string;
    answered_at?: string;
  }>;
  key_findings: Array<{
    type: string;
    title: string;
    detail?: string;
    mitre_id?: string;
    severity?: string;
  }>;
  evidence: {
    events: any[];
    traffic: any[];
    traces: any[];
    artifacts: any[];
    alerts: any[];
    indicators: any[];
    containment_actions: any[];
  };
  diary: {
    opening: string;
    method: string;
    review_tip: string;
  };
}

export interface SocTool {
  id: string;
  name: string;
  description: string;
  category: string;
  public_url: string;
  status: "online" | "offline";
  detail: string;
}

export interface MitreTactic {
  id?: string;
  name: string;
  shortname: string;
}

export interface MitreTechnique {
  id: string;
  stix_id?: string;
  name: string;
  description: string;
  tactics: string[];
  platforms: string[];
  data_sources: string[];
  is_subtechnique: boolean;
  url?: string;
}

/* ════════════════════════ Collaborative Labs ════════════════════════ */
export type LabGroupRole = "owner" | "lead_analyst" | "analyst" | "observer";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type InvitationStatus = "pending" | "accepted" | "declined";
export type PresenceStatusValue = "online" | "idle" | "away" | "offline";

export interface LabGroup {
  id: number;
  scenario_id: number;
  name: string;
  status: "open" | "closed";
  created_by: number;
  created_at: string;
}

export interface LabGroupMember {
  id: number;
  group_id: number;
  user_id: number;
  user_full_name?: string;
  user_email?: string;
  player_lab_id?: number;
  role: LabGroupRole;
  joined_at: string;
  invited_by?: number;
}

export interface LabInvitation {
  id: number;
  group_id: number;
  invited_user_id: number;
  invited_by: number;
  role: LabGroupRole;
  status: InvitationStatus;
  created_at: string;
  responded_at?: string;
}

export interface LabTask {
  id: number;
  group_id: number;
  title: string;
  description?: string;
  mitre_id?: string;
  assigned_to?: number;
  created_by: number;
  status: TaskStatus;
  completed_at?: string;
  created_at: string;
}

export interface SharedNote {
  id: number;
  group_id: number;
  author_id: number;
  title: string;
  content: string;
  version: number;
  locked_by?: number;
  locked_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface LabMessage {
  id: number;
  group_id: number;
  sender_id: number;
  content: string;
  mentions: number[];
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  group_id: number;
  user_id?: number;
  action_type: string;
  description: string;
  meta: Record<string, any>;
  created_at: string;
}

export interface PresenceEntry {
  user_id: number;
  status: PresenceStatusValue;
  last_seen: string;
}

export interface PersonalProgress {
  user_id: number;
  bookmarks: string[];
  evidence_viewed: string[];
  completed_tasks: number;
  questions_solved: number;
  time_spent_seconds: number;
  accuracy: number;
}

export interface ScoreboardRow {
  user_id: number;
  full_name: string;
  role: string;
  tasks_completed: number;
  evidence_viewed: number;
  questions_solved: number;
  accuracy: number;
  time_spent_seconds: number;
  total_score: number;
}

export interface GroupDashboard {
  group: LabGroup;
  members: LabGroupMember[];
  open_tasks: number;
  completed_tasks: number;
  progress_pct: number;
  latest_notes: SharedNote[];
  latest_activity: ActivityEntry[];
}

export interface SharedEvidence {
  id: number;
  lab_id: number;
  investigation_id?: number;
  owner_id: number;
  owner_name?: string;
  evidence_type: "ioc" | "event" | "artifact" | "custom";
  evidence_ref_id?: number;
  title: string;
  description?: string;
  source?: string;
  related_ioc?: string;
  related_mitre_technique?: string;
  visibility: string;
  shared_at: string;
}

export interface AdminLabGroupRow {
  id: number;
  name: string;
  scenario_title?: string;
  scenario_id: number;
  owner_name?: string;
  created_at: string;
  status: "open" | "closed";
  member_count: number;
}

export interface AdminLabGroupList {
  items: AdminLabGroupRow[];
  total: number;
  page: number;
  page_size: number;
}

/* ════════════════════════ Threat Feed (newsdata.io) ════════════════════════ */
export interface NewsArticle {
  id: string;
  title: string;
  link: string;
  description: string;
  published_at?: string;
  source: string;
  image_url?: string;
  categories: string[];
}

export interface NewsFeed {
  query: string;
  articles: NewsArticle[];
  next_page?: string;
  total_results: number;
  cached: boolean;
}

export interface NewsSettings {
  api_key_configured: boolean;
  source: string;
}

/* ════════════════════════ AI Assistant ════════════════════════ */
export interface ChatSource {
  url: string;
  title: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  guarded?: boolean;
  sources?: ChatSource[];
  searchResults?: SearchResult[];
}

export interface PlayerChatResponse {
  reply: string;
  guarded: boolean;
  lab_id?: number;
  scenario_title?: string;
  search_results: SearchResult[];
  search_error?: string;
}

export interface AdminChatResponse {
  reply: string;
  sources: ChatSource[];
  source_errors: Array<{ url: string; error: string }>;
  scenario_title?: string;
  search_results: SearchResult[];
  search_error?: string;
}

export interface AssistantScenarioHit {
  id: number;
  title: string;
  difficulty: string;
  status: string;
  mitre_techniques: string[];
}

export interface ModeratorAnalysis {
  title: string;
  executive_summary: string;
  attack_description: string;
  attack_flow: Array<{
    order: number;
    phase: string;
    action: string;
    mitre_id?: string;
    evidence: string;
  }>;
  simulation_plan: {
    assets: string[];
    events: Array<{
      source: string;
      event_type: string;
      description: string;
      mitre_id?: string;
      malicious_count: number;
      normal_count: number;
    }>;
    artifacts: string[];
    alerts: string[];
    investigation_questions: string[];
    containment_actions: string[];
  };
  recommended_mitre_ids: string[];
  assumptions: string[];
  safety_notes: string[];
  sources: Array<{ url: string; title: string; character_count: number }>;
  source_errors: Array<{ url: string; error: string }>;
  analysis_mode: string;
}
