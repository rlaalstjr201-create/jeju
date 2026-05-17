export class CalibrationProfile {
  private constructor(
    readonly curatedRatio: number,
    readonly isUserAdjusted: boolean,
  ) {}

  static default(): CalibrationProfile {
    return new CalibrationProfile(0.5, false);
  }

  static fromUserInput(ratio: number): CalibrationProfile {
    if (ratio < 0 || ratio > 1) throw new Error(`Invalid curatedRatio: ${ratio}`);
    return new CalibrationProfile(ratio, true);
  }

  get popularRatio(): number {
    return 1 - this.curatedRatio;
  }
}
