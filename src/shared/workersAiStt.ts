import type { SttProvider, SttRequest, SttResult, TranscriptSegment } from './stt';

const MODEL = '@cf/openai/whisper-large-v3-turbo';

type WorkersAiLike = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

type AudioLoader = (objectKey: string) => Promise<string>;

type WhisperSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type WhisperResponse = {
  text?: string;
  transcription_info?: {
    text?: string;
  };
  language?: string;
  segments?: WhisperSegment[];
  request_id?: string;
};

const normalizeSegments = (segments: WhisperSegment[] | undefined): TranscriptSegment[] | undefined => {
  if (!segments?.length) return undefined;
  const normalized = segments.flatMap((segment) => {
    if (
      typeof segment.start !== 'number' ||
      typeof segment.end !== 'number' ||
      typeof segment.text !== 'string'
    ) {
      return [];
    }
    return [
      {
        startMs: Math.max(0, Math.round(segment.start * 1000)),
        endMs: Math.max(0, Math.round(segment.end * 1000)),
        text: segment.text,
      },
    ];
  });
  return normalized.length ? normalized : undefined;
};

const providerFailure = (error: unknown): SttResult => {
  const message = error instanceof Error ? error.message : 'Workers AI transcription failed';
  const retryable = /\b(408|429|5\d\d)\b|timeout|temporar|unavailable|rate.?limit/iu.test(message);
  return {
    ok: false,
    error: {
      kind: retryable ? 'retryable' : 'terminal',
      code: retryable ? 'stt_provider_retryable' : 'stt_provider_error',
      message,
    },
  };
};

export class WorkersAiSttProvider implements SttProvider {
  constructor(
    private readonly ai: WorkersAiLike,
    private readonly loadAudioBase64: AudioLoader,
  ) {}

  async transcribe(request: SttRequest): Promise<SttResult> {
    let audio: string;
    try {
      audio = await this.loadAudioBase64(request.audioObjectKey);
    } catch (error) {
      return {
        ok: false,
        error: {
          kind: 'terminal',
          code: 'audio_asset_unreadable',
          message: error instanceof Error ? error.message : 'Audio asset could not be read',
        },
      };
    }

    try {
      const raw = (await this.ai.run(MODEL, {
        audio,
        task: 'transcribe',
        ...(request.initialPrompt ? { initial_prompt: request.initialPrompt } : {}),
      })) as WhisperResponse;
      const text = raw.transcription_info?.text ?? raw.text;
      if (typeof text !== 'string' || !text.trim()) {
        return {
          ok: false,
          error: {
            kind: 'terminal',
            code: 'stt_empty_transcript',
            message: 'Workers AI returned no transcript text',
          },
        };
      }

      return {
        ok: true,
        value: {
          text,
          ...(raw.language ? { language: raw.language } : {}),
          ...(normalizeSegments(raw.segments) ? { segments: normalizeSegments(raw.segments) } : {}),
          provider: 'cloudflare-workers-ai',
          model: MODEL,
          ...(raw.request_id ? { providerRequestId: raw.request_id } : {}),
        },
      };
    } catch (error) {
      return providerFailure(error);
    }
  }
}
