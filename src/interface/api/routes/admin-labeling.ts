import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../AppDependencies.js';
import { mapErrorToReply } from './_shared.js';

export function registerAdminLabelingRoutes(fastify: FastifyInstance, deps: AppDependencies): void {
  fastify.register(async (scoped) => {
    // Capture raw body as string for HMAC verification
    scoped.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      done(null, body);
    });

    // POST /api/v1/admin/labeling/webhook
    scoped.post('/api/v1/admin/labeling/webhook', async (req, reply) => {
      try {
        const rawBody = (req.body as string) ?? '';
        const signature = (req.headers['x-label-studio-signature'] as string | undefined) ?? '';
        await deps.labelStudioBridge.handleWebhookWithSignature(rawBody, signature);
        return reply.status(204).send();
      } catch (err) {
        return mapErrorToReply(reply, err);
      }
    });
  });
}
