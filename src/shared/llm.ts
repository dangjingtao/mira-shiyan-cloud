import type { SceneSpec, StructuredOrganization } from './scenes';
export type { SceneSectionSpec, SceneSpec, StructuredOrganization } from './scenes';

export type LlmFailureCode =
  | 'provider_error'
  | 'rate_limited'
  | 'timeout'
  | 'invalid_request'
  | 'invalid_response'
  | 'not_configured';

export interface LlmFailure {
  kind: 'retryable' | 'terminal';
  code: LlmFailureCode;
  message: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface OrganizeSuccess {
  markdown: string;
  structured: StructuredOrganization;
  provider: string;
  model: string;
  latencyMs: number;
  usage?: LlmUsage;
  providerRequestId?: string;
  fallbackUsed: boolean;
}

export type LlmOutcome =
  | { ok: true; value: OrganizeSuccess }
  | { ok: false; error: LlmFailure };

export interface OrganizeRequest {
  taskId: string;
  correlationId: string;
  scene: SceneSpec;
  title: string;
  transcriptText: string;
  language?: string;
}

export interface AdjustRequest extends OrganizeRequest {
  currentDraft: {
    structured: StructuredOrganization;
    markdown: string;
  };
  instruction: string;
}

/**
 * Service Binding contract between `shiyan-api` and the private `shiyan-llm`
 * Worker. The LLM Worker never touches D1: callers pass the scene spec and
 * transcript evidence, and the Worker answers with normalized outcomes so
 * provider errors never leak raw upstream bodies or keys to clients.
 */
export interface ShiyanLlmBinding {
  generateStructured(input: OrganizeRequest): Promise<LlmOutcome>;
  adjustDraft(input: AdjustRequest): Promise<LlmOutcome>;
}
