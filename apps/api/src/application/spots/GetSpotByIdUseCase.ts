import type { SpotDetail, SpotDetailResponse, SpotCategory } from '@jeju/shared';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import { SpotNotFoundError } from '../errors.js';

export class GetSpotByIdUseCase {
  constructor(private readonly spotRepo: SpotRepository) {}

  async execute(id: string): Promise<SpotDetailResponse> {
    const spot = await this.spotRepo.findById(id);
    if (spot === undefined) {
      throw new SpotNotFoundError();
    }
    const detail: SpotDetail = {
      id: spot.id,
      name: spot.name,
      category: spot.category as SpotCategory,
      lat: spot.lat,
      lng: spot.lng,
      thumbnailUrl: spot.thumbnailUrl,
      curatorComment: spot.curatorComment,
      region: spot.region,
      source: spot.curatorCommentSource,
    };
    return { spot: detail };
  }
}
