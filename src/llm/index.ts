import { WorkerEntrypoint } from 'cloudflare:workers';
import type { AdjustRequest, LlmOutcome, OrganizeRequest } from '../shared/llm';
import { ShiyanLlmGateway, resolveLlmSlots, type LlmEnvLike } from '../shared/llmGateway';

export type { AdjustRequest, LlmOutcome, OrganizeRequest } from '../shared/llm';

/**
 * Private LLM service Worker (MOB-020).
 *
 * - Reached only through the `shiyan-api` Service Binding; it has no public
 *   route and never touches D1, so it cannot interpret CaptureTask state.
 * - Holds provider configuration; API keys live in Cloudflare secrets.
 * - Answers with normalized outcomes: raw provider errors and keys never
 *   cross the binding.
 */
export class ShiyanLlmWorker extends WorkerEntrypoint<LlmEnvLike> {
  async fetch(): Promise<Response> {
    return Response.json(
      { ok: false, error: { code: 'route_not_found', message: 'Route not found' } },
      { status: 404 },
    );
  }

  private gateway(): ShiyanLlmGateway {
    return new ShiyanLlmGateway(resolveLlmSlots(this.env));
  }

  async generateStructured(input: OrganizeRequest): Promise<LlmOutcome> {
    return this.gateway().generateStructured(input);
  }

  async adjustDraft(input: AdjustRequest): Promise<LlmOutcome> {
    return this.gateway().adjustDraft(input);
  }
}

export default ShiyanLlmWorker;
