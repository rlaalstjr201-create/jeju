import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  TripNotFoundError,
  ForbiddenError,
  SpotNotFoundError,
  DayNotFoundError,
} from '../../../application/errors.js';
import { ShortlistEmptyError } from '../../../domain/schedule-composer/ScheduleComposer.js';
import { InvalidDateRangeError } from '../../../domain/trip/Trip.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function extractToken(req: FastifyRequest): string {
  const auth = req.headers.authorization ?? '';
  return auth.replace(/^Bearer\s+/i, '');
}

export function requireCuratorRole(req: FastifyRequest): void {
  const token = extractToken(req);
  // Dev mode: 'dev-curator-{id}' tokens carry curator role
  if (token.startsWith('dev-curator-')) return;
  // Production: match CURATOR_SECRET env
  const secret = process.env['CURATOR_SECRET'];
  if (secret && token === secret) return;
  const err = new Error('Curator role required');
  err.name = 'UnauthorizedError';
  throw err;
}

export function mapErrorToReply(
  reply: FastifyReply,
  err: unknown,
): ReturnType<FastifyReply['send']> {
  if (err instanceof ValidationError) {
    return reply.status(400).send({ code: 'VALIDATION_ERROR', message: err.message });
  }
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
  if (err instanceof Error) {
    if (
      err.name === 'UnauthorizedError' ||
      err.message.includes('Unauthorized') ||
      err.message.includes('401')
    ) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: err.message });
    }
    if (err.name === 'CandidateNotFoundError') {
      return reply.status(404).send({ code: 'CANDIDATE_NOT_FOUND', message: err.message });
    }
    if (err.name === 'InvalidStatusError') {
      return reply.status(409).send({ code: 'INVALID_STATUS', message: err.message });
    }
    if (err.name === 'ApproveError') {
      return reply.status(422).send({ code: 'APPROVE_ERROR', message: err.message });
    }
  }
  return reply.status(500).send({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
}
