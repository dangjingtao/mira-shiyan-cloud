import { WorkerEntrypoint } from 'cloudflare:workers';

export interface OrganizeRequest {
  taskId: string;
  sceneId: string;
  transcriptId: string;
}

export interface OrganizeResult {
  markdown: string;
  structured: Record<string, unknown>;
  provider: string;
  latencyMs: number;
}

export class ShiyanLlmWorker extends WorkerEntrypoint {
  async generateStructured(_input: OrganizeRequest): Promise<OrganizeResult> {
    // MOB-018 only establishes the private Service Binding boundary. Provider
    // selection, secrets, fallback, structured validation and usage belong to
    // MOB-020 and must not be faked here.
    throw new Error('provider_not_configured');
  }
}

export default ShiyanLlmWorker;
