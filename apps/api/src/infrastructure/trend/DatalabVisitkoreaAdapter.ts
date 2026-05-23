import type { TrendDiscoveryPort, TrendCandidate } from '../../domain/ports/TrendDiscoveryPort.js';
import type { TrendDataSourcePort, TrendSignal } from '../../domain/ports/TrendDataSourcePort.js';
import type { Region } from '../../domain/shared/Region.js';

export class DatalabVisitkoreaAdapter implements TrendDiscoveryPort, TrendDataSourcePort {
  readonly sourceName = 'datalab-visitkorea';

  async fetchCandidatesByRegion(
    _region?: Region,
    _category?: string,
    _limit?: number,
  ): Promise<TrendCandidate[]> {
    // TODO: integrate with datalab.visitkorea.or.kr API when DATALAB_API_KEY is set
    console.warn('[DatalabVisitkoreaAdapter] fetchCandidatesByRegion: API not yet integrated');
    return [];
  }

  async fetchSignalsForSpots(_spotIds: string[]): Promise<TrendSignal[]> {
    // TODO: integrate with datalab.visitkorea.or.kr API when DATALAB_API_KEY is set
    console.warn('[DatalabVisitkoreaAdapter] fetchSignalsForSpots: API not yet integrated');
    return [];
  }
}
