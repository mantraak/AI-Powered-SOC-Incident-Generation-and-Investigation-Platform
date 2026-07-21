import api from "../api/client";
import type { DraftConflict, Scenario } from "../types";

export interface CreateDraftLabInput {
  title: string;
  description?: string;
  source_url?: string;
  source_title?: string;
  source_article?: string;
  ai_prompt?: string;
  mitre_techniques?: string[];
  iocs?: string[];
  difficulty?: string;
  num_questions?: number;
}

export interface CreateDraftLabResult {
  scenario?: Scenario;
  conflict?: DraftConflict;
}

/**
 * Single entry point for the AI-to-Draft-Lab workflow. Both the Threat Feed
 * "Create Lab" button and the AI Assistant "Create Draft Lab" action call this
 * so the duplicate-detection and draft-creation logic lives in exactly one place.
 *
 * On a 409 (a Draft already exists for this source_url) the conflict is
 * returned instead of thrown, so callers can offer "Open Existing Draft" or
 * "Create New Version" without a try/catch at every call site.
 */
export async function createDraftLab(
  input: CreateDraftLabInput,
  options: { forceNewVersion?: boolean } = {}
): Promise<CreateDraftLabResult> {
  try {
    const res = await api.post<Scenario>("/scenarios/from-source", {
      ...input,
      force_new_version: Boolean(options.forceNewVersion),
    });
    return { scenario: res.data };
  } catch (err: any) {
    if (err.response?.status === 409 && err.response?.data?.detail) {
      return { conflict: err.response.data.detail as DraftConflict };
    }
    throw err;
  }
}
