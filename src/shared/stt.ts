export type SttFailureKind = 'retryable' | 'terminal';

export type SttRequest = {
  taskId: string;
  audioObjectKey: string;
  contentType: string;
  initialPrompt?: string;
};

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type SttSuccess = {
  text: string;
  language?: string;
  durationMs?: number;
  segments?: TranscriptSegment[];
  provider: string;
  model: string;
  providerRequestId?: string;
};

export type SttFailure = {
  kind: SttFailureKind;
  code: string;
  message: string;
};

export type SttResult =
  | { ok: true; value: SttSuccess }
  | { ok: false; error: SttFailure };

export interface SttProvider {
  transcribe(request: SttRequest): Promise<SttResult>;
}
