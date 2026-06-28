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
