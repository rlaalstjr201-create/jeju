import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from './AppDependencies.js';
import { registerTripsRoutes } from './routes/trips.js';
import { registerRecommendationsRoutes } from './routes/recommendations.js';
import { registerShortlistRoutes } from './routes/shortlist.js';
import { registerDayPlanRoutes } from './routes/dayplan.js';
import { registerAdminCurationRoutes } from './routes/admin-curation.js';
import { registerCalibrationRoutes } from './routes/calibration.js';
import { registerAdminPipelineRoutes } from './routes/admin-pipeline.js';
import { registerAdminLabelingRoutes } from './routes/admin-labeling.js';
import { registerAdminEmbeddingRoutes } from './routes/admin-embedding.js';

export type { AppDependencies } from './AppDependencies.js';

export function buildServer(deps: AppDependencies): FastifyInstance {
  const fastify = Fastify({ logger: true });

  registerTripsRoutes(fastify, deps);
  registerRecommendationsRoutes(fastify, deps);
  registerShortlistRoutes(fastify, deps);
  registerDayPlanRoutes(fastify, deps);
  registerAdminCurationRoutes(fastify, deps);
  registerCalibrationRoutes(fastify, deps);
  registerAdminPipelineRoutes(fastify, deps);
  registerAdminLabelingRoutes(fastify, deps);
  registerAdminEmbeddingRoutes(fastify, deps);

  return fastify;
}
