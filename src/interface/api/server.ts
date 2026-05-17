import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from './AppDependencies.js';
import { registerTripsRoutes } from './routes/trips.js';
import { registerRecommendationsRoutes } from './routes/recommendations.js';
import { registerShortlistRoutes } from './routes/shortlist.js';
import { registerDayPlanRoutes } from './routes/dayplan.js';

export type { AppDependencies } from './AppDependencies.js';

export function buildServer(deps: AppDependencies): FastifyInstance {
  const fastify = Fastify({ logger: true });

  registerTripsRoutes(fastify, deps);
  registerRecommendationsRoutes(fastify, deps);
  registerShortlistRoutes(fastify, deps);
  registerDayPlanRoutes(fastify, deps);

  return fastify;
}
