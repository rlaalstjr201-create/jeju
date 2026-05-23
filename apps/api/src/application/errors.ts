export class TripNotFoundError extends Error {
  constructor() {
    super('TRIP_NOT_FOUND');
    this.name = 'TripNotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class SpotNotFoundError extends Error {
  constructor() {
    super('SPOT_NOT_FOUND');
    this.name = 'SpotNotFoundError';
  }
}

export class DayNotFoundError extends Error {
  constructor() {
    super('DAY_NOT_FOUND');
    this.name = 'DayNotFoundError';
  }
}
