import type { TrendDiscoveryPort, TrendCandidate } from '../../domain/ports/TrendDiscoveryPort.js';
import type { TrendDataSourcePort, TrendSignal } from '../../domain/ports/TrendDataSourcePort.js';
import type { Region } from '../../domain/shared/Region.js';

export class JejuTourismBigdataAdapter implements TrendDiscoveryPort, TrendDataSourcePort {
  readonly sourceName = 'jeju-tourism-bigdata';

  async fetchCandidatesByRegion(
    _region?: Region,
    _category?: string,
    _limit?: number,
  ): Promise<TrendCandidate[]> {
    // TODO: integrate with data.ijto.or.kr API when IJTO_API_KEY is set
    console.warn('[JejuTourismBigdataAdapter] fetchCandidatesByRegion: API not yet integrated');
    return [];
  }

  async fetchSignalsForSpots(_spotIds: string[]): Promise<TrendSignal[]> {
    // TODO: integrate with data.ijto.or.kr API when IJTO_API_KEY is set
    console.warn('[JejuTourismBigdataAdapter] fetchSignalsForSpots: API not yet integrated');
    return [];
  }
}
