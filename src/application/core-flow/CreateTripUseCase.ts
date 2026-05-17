import { randomUUID } from 'node:crypto';
import { Trip } from '../../domain/trip/Trip.js';
import type { TravellerAuthService } from '../../infrastructure/kakao/TravellerAuthService.js';
import type { ParseFreeTextPort } from '../ports/ParseFreeTextPort.js';
import type { TripRepository } from '../../domain/ports/TripRepository.js';

interface CreateTripInput {
  readonly accessToken: string;
  readonly freeText: string;
}

interface CreateTripOutput {
  readonly tripId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly dateInferred: boolean;
}

export class CreateTripUseCase {
  constructor(
    private readonly authService: TravellerAuthService,
    private readonly parsePort: ParseFreeTextPort,
    private readonly tripRepository: TripRepository,
  ) {}

  async execute(input: CreateTripInput): Promise<CreateTripOutput> {
    const [traveller, parsed] = await Promise.all([
      this.authService.authenticate(input.accessToken),
      this.parsePort.parse(input.freeText),
    ]);

    const trip = new Trip({
      id: randomUUID(),
      travellerId: traveller.id,
      dateRange: { start: parsed.startDate, end: parsed.endDate },
      phase: 'planning',
      dateInferred: parsed.isInferred,
    });

    await this.tripRepository.save(trip);

    return {
      tripId: trip.id,
      startDate: parsed.startDate.toISO(),
      endDate: parsed.endDate.toISO(),
      dateInferred: parsed.isInferred,
    };
  }
}
