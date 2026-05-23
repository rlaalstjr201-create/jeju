import type { SpotMetaInfererPort, SpotMetaInferInput, SpotMetaInference } from '../../application/ports/SpotMetaInfererPort.js';
import type { LlmProviderPort, LlmTool } from '../../application/ports/LlmProviderPort.js';

export class SpotMetaInfererError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SpotMetaInfererError';
  }
}

const INFER_TOOL: LlmTool = {
  name: 'infer_spot_meta',
  description: 'Infer 4 meta attributes for a Jeju travel spot.',
  parameters: {
    type: 'object',
    properties: {
      atmosphere: { type: 'string', description: 'Atmosphere description (within 20 chars)' },
      crowd_level: { type: 'string', description: 'Estimated crowd level (within 20 chars)' },
      best_time: { type: 'string', description: 'Recommended visit time (within 20 chars)' },
      target_visitor: { type: 'string', description: 'Primary visitor profile (within 30 chars)' },
    },
    required: ['atmosphere', 'crowd_level', 'best_time', 'target_visitor'],
  },
};

export class SpotMetaInfererAdapter implements SpotMetaInfererPort {
  private readonly provider: LlmProviderPort;

  constructor(provider: LlmProviderPort) {
    this.provider = provider;
  }

  async infer(input: SpotMetaInferInput): Promise<SpotMetaInference> {
    let raw: Record<string, unknown>;
    try {
      raw = await this.provider.callWithTool({
        userMessage: `Place: ${input.name}\nIntroduction: ${input.introduction}\nTags: ${input.tags}\n\nInfer the 4 meta attributes for this Jeju travel spot.`,
        tool: INFER_TOOL,
        maxTokens: 256,
      });
    } catch (err) {
      throw new SpotMetaInfererError('SpotMetaInferer inference failed', err);
    }

    return {
      atmosphere: raw['atmosphere'] as string,
      crowd_level: raw['crowd_level'] as string,
      best_time: raw['best_time'] as string,
      target_visitor: raw['target_visitor'] as string,
    };
  }
}
