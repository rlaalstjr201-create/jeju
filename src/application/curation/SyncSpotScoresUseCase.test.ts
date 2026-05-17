import { describe, it, expect, vi } from 'vitest';
import { SyncSpotScoresUseCase } from './SyncSpotScoresUseCase.js';
import type { TrendDataSourcePort } from '../../domain/ports/TrendDataSourcePort.js';

function makeSource(name: string, signals: { spotId: string; popularitySignal: number; trendSignal: number }[] = []): TrendDataSourcePort {
  return {
    sourceName: name,
    fetchSignalsForSpots: vi.fn().mockResolvedValue(signals),
  };
}

function makeMocks() {
  const spotRepo = {
    findById: vi.fn(),
    findByIds: vi.fn(),
    search: vi.fn(),
    findTopByCurationScore: vi.fn(),
    findByRegion: vi.fn(),
    save: vi.fn(),
    saveReturningId: vi.fn(),
    findExistingKakaoPlaceIds: vi.fn(),
    findAllActiveIds: vi.fn().mockResolvedValue(['spot-1', 'spot-2']),
    deactivate: vi.fn(),
    updateScores: vi.fn().mockResolvedValue(undefined),
  };
  const trendSourceRepo = {
    getStatus: vi.fn().mockResolvedValue(null),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };
  return { spotRepo, trendSourceRepo };
}

describe('SyncSpotScoresUseCase', () => {
  it('(B2) uses findAllActiveIds — not findTopByCurationScore', async () => {
    const { spotRepo, trendSourceRepo } = makeMocks();
    const source = makeSource('datalab');
    const useCase = new SyncSpotScoresUseCase([source], spotRepo as never, trendSourceRepo as never);
    await useCase.execute();

    expect(spotRepo.findAllActiveIds).toHaveBeenCalledOnce();
    expect(spotRepo.findTopByCurationScore).not.toHaveBeenCalled();
  });

  it('(B2) passes active IDs to fetchSignalsForSpots', async () => {
    const { spotRepo, trendSourceRepo } = makeMocks();
    spotRepo.findAllActiveIds.mockResolvedValue(['id-a', 'id-b', 'id-c']);
    const source = makeSource('datalab', [{ spotId: 'id-a', popularitySignal: 80, trendSignal: 70 }]);
    const useCase = new SyncSpotScoresUseCase([source], spotRepo as never, trendSourceRepo as never);
    await useCase.execute();

    expect((source.fetchSignalsForSpots as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(['id-a', 'id-b', 'id-c']);
  });

  it('(B1) increments consecutive failures from DB state on failure', async () => {
    const { spotRepo, trendSourceRepo } = makeMocks();
    trendSourceRepo.getStatus.mockResolvedValue({ consecutiveFailures: 2 });
    const source = {
      sourceName: 'datalab',
      fetchSignalsForSpots: vi.fn().mockRejectedValue(new Error('network error')),
    };
    const useCase = new SyncSpotScoresUseCase([source as TrendDataSourcePort], spotRepo as never, trendSourceRepo as never);
    const result = await useCase.execute();

    expect(trendSourceRepo.getStatus).toHaveBeenCalledWith('datalab');
    expect(trendSourceRepo.updateStatus).toHaveBeenCalledWith('datalab', 'failure', 3);
    expect(result.failed).toContain('datalab');
  });

  it('(B1) resets consecutive failures to 0 on success', async () => {
    const { spotRepo, trendSourceRepo } = makeMocks();
    const source = makeSource('datalab', [{ spotId: 'spot-1', popularitySignal: 60, trendSignal: 40 }]);
    const useCase = new SyncSpotScoresUseCase([source], spotRepo as never, trendSourceRepo as never);
    await useCase.execute();

    expect(trendSourceRepo.updateStatus).toHaveBeenCalledWith('datalab', 'success', 0);
  });

  it('(B1) issues ALERT log when consecutive failures reach 3', async () => {
    const { spotRepo, trendSourceRepo } = makeMocks();
    trendSourceRepo.getStatus.mockResolvedValue({ consecutiveFailures: 2 });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const source = {
      sourceName: 'datalab',
      fetchSignalsForSpots: vi.fn().mockRejectedValue(new Error('down')),
    };
    const useCase = new SyncSpotScoresUseCase([source as TrendDataSourcePort], spotRepo as never, trendSourceRepo as never);
    await useCase.execute();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[ALERT]'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
    consoleSpy.mockRestore();
  });

  it('dryRun skips updateStatus and updateScores', async () => {
    const { spotRepo, trendSourceRepo } = makeMocks();
    const source = makeSource('datalab', [{ spotId: 'spot-1', popularitySignal: 60, trendSignal: 40 }]);
    const useCase = new SyncSpotScoresUseCase([source], spotRepo as never, trendSourceRepo as never);
    const result = await useCase.execute({ dryRun: true });

    expect(trendSourceRepo.updateStatus).not.toHaveBeenCalled();
    expect(spotRepo.updateScores).not.toHaveBeenCalled();
    expect(result.updated).toBe(0);
  });
});
