import { describe, it, expect } from 'vitest';
import { CalibrationProfile } from './CalibrationProfile.js';

describe('CalibrationProfile', () => {
  it('default() returns 0.5:0.5, isUserAdjusted=false', () => {
    const profile = CalibrationProfile.default();
    expect(profile.curatedRatio).toBe(0.5);
    expect(profile.popularRatio).toBe(0.5);
    expect(profile.isUserAdjusted).toBe(false);
  });

  it('fromUserInput(0.8) returns curatedRatio=0.8, isUserAdjusted=true', () => {
    const profile = CalibrationProfile.fromUserInput(0.8);
    expect(profile.curatedRatio).toBe(0.8);
    expect(profile.popularRatio).toBeCloseTo(0.2);
    expect(profile.isUserAdjusted).toBe(true);
  });

  it('fromUserInput(0.0) is valid', () => {
    const profile = CalibrationProfile.fromUserInput(0.0);
    expect(profile.curatedRatio).toBe(0.0);
    expect(profile.popularRatio).toBe(1.0);
    expect(profile.isUserAdjusted).toBe(true);
  });

  it('fromUserInput(1.0) is valid', () => {
    const profile = CalibrationProfile.fromUserInput(1.0);
    expect(profile.curatedRatio).toBe(1.0);
    expect(profile.popularRatio).toBe(0.0);
    expect(profile.isUserAdjusted).toBe(true);
  });

  it('fromUserInput(-0.1) throws', () => {
    expect(() => CalibrationProfile.fromUserInput(-0.1)).toThrow('Invalid curatedRatio: -0.1');
  });

  it('fromUserInput(1.1) throws', () => {
    expect(() => CalibrationProfile.fromUserInput(1.1)).toThrow('Invalid curatedRatio: 1.1');
  });

});
