import type { SpotCard, SpotsResponse, SpotCategory } from '@jeju/shared';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';

export interface ListApprovedSpotsInput {
  category?: string;
}

export type { SpotCard, SpotsResponse };

export class ListApprovedSpotsUseCase {
  constructor(private readonly spotRepo: SpotRepository) {}

  async execute(input: ListApprovedSpotsInput): Promise<SpotsResponse> {
    const spots = await this.spotRepo.findApproved(input.category);
    return {
      spots: spots.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category as SpotCategory,
        lat: s.lat,
        lng: s.lng,
        thumbnailUrl: s.thumbnailUrl,
        imageUrl: s.imageUrl ?? null,
        curatorComment: s.curatorComment,
        region: s.region,
      })),
    };
  }
}
