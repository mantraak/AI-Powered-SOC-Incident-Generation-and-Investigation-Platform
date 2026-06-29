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
