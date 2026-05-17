import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  TripNotFoundError,
  ForbiddenError,
  SpotNotFoundError,
  DayNotFoundError,
} from '../../../application/errors.js';
import { ShortlistEmptyError } from '../../../domain/schedule-composer/ScheduleComposer.js';
import { InvalidDateRangeError } from '../../../domain/trip/Trip.js';

export function extractToken(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

export function mapErrorToReply(
  reply: FastifyReply,
  err: unknown,
): ReturnType<FastifyReply['send']> {
  if (err instanceof InvalidDateRangeError) {
    return reply.status(400).send({ code: 'INVALID_DATE_RANGE', message: (err as Error).message });
  }
  if (err instanceof ShortlistEmptyError) {
    return reply.status(400).send({ code: 'SHORTLIST_EMPTY' });
  }
  if (err instanceof SpotNotFoundError) {
    return reply.status(404).send({ code: 'SPOT_NOT_FOUND', message: (err as Error).message });
  }
  if (err instanceof DayNotFoundError) {
    return reply.status(404).send({ code: 'DAY_NOT_FOUND', message: (err as Error).message });
  }
  if (err instanceof TripNotFoundError) {
    return reply.status(404).send({ code: 'TRIP_NOT_FOUND', message: (err as Error).message });
  }
  if (err instanceof ForbiddenError) {
    return reply.status(403).send({ code: 'FORBIDDEN', message: (err as Error).message });
  }
  if (
    err instanceof Error &&
    (err.name === 'UnauthorizedError' ||
      err.message.includes('Unauthorized') ||
      err.message.includes('401'))
  ) {
    return reply.status(401).send({ code: 'UNAUTHORIZED', message: err.message });
  }
  return reply.status(500).send({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
}
