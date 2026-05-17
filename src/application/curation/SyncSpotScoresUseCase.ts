import type { TrendDataSourcePort } from '../../domain/ports/TrendDataSourcePort.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { TrendSourceRepository } from '../../domain/ports/TrendSourceRepository.js';

interface SyncSpotScoresInput {
  dryRun?: boolean;
}

interface SyncSpotScoresOutput {
  updated: number;
  failed: string[];
}

export class SyncSpotScoresUseCase {
  constructor(
    private readonly trendSources: TrendDataSourcePort[],
    private readonly spotRepo: SpotRepository,
    private readonly trendSourceRepo: TrendSourceRepository,
  ) {}

  async execute(input: SyncSpotScoresInput = {}): Promise<SyncSpotScoresOutput> {
    const { dryRun = false } = input;

    // B2: use findAllActiveIds instead of findTopByCurationScore (avoids top-N cap)
    const activeSpotIds = await this.spotRepo.findAllActiveIds();

    if (activeSpotIds.length === 0) {
      return { updated: 0, failed: [] };
    }

    // Fetch signals from all sources in parallel (Promise.allSettled — partial failure allowed)
    const results = await Promise.allSettled(
      this.trendSources.map((source) => source.fetchSignalsForSpots(activeSpotIds)),
    );

    const failed: string[] = [];

    // Build score map from successful results
    const scoreMap = new Map<string, { popularitySum: number; trendSum: number; count: number }>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const source = this.trendSources[i];
      if (result === undefined || source === undefined) continue;

      if (result.status === 'rejected') {
        failed.push(source.sourceName);

        if (!dryRun) {
          // B1: read previous failure count, increment, check threshold
          const current = await this.trendSourceRepo.getStatus(source.sourceName);
          const newFailures = (current?.consecutiveFailures ?? 0) + 1;
          await this.trendSourceRepo.updateStatus(source.sourceName, 'failure', newFailures);
          if (newFailures >= 3) {
            console.log(`[ALERT] TrendSource ${source.sourceName} failed ${newFailures} consecutive times`);
          }
        }

        continue;
      }

      for (const signal of result.value) {
        const existing = scoreMap.get(signal.spotId) ?? {
          popularitySum: 0,
          trendSum: 0,
          count: 0,
        };
        existing.popularitySum += signal.popularitySignal;
        existing.trendSum += signal.trendSignal;
        existing.count += 1;
        scoreMap.set(signal.spotId, existing);
      }

      if (!dryRun) {
        await this.trendSourceRepo.updateStatus(source.sourceName, 'success', 0);
      }
    }

    if (dryRun || scoreMap.size === 0) {
      return { updated: 0, failed };
    }

    const updates = Array.from(scoreMap.entries()).map(([spotId, scores]) => ({
      spotId,
      popularityScore: Math.min(100, Math.max(0, Math.round(scores.popularitySum / scores.count))),
      trendScore: Math.min(100, Math.max(0, Math.round(scores.trendSum / scores.count))),
    }));

    await this.spotRepo.updateScores(updates);

    return { updated: updates.length, failed };
  }
}
