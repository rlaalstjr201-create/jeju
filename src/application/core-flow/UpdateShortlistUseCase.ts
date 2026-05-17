import type { TravellerAuthService } from '../../infrastructure/kakao/TravellerAuthService.js';
import type { SpotRepository } from '../../domain/ports/SpotRepository.js';
import type { ShortlistRepository } from '../../domain/ports/ShortlistRepository.js';
import { SpotNotFoundError } from '../errors.js';
export { SpotNotFoundError };

interface UpdateShortlistInput {
  readonly accessToken: string;
  readonly spotId: string;
  readonly action: 'add' | 'remove';
}

interface UpdateShortlistOutput {
  readonly shortlistCount: number;
}

export class UpdateShortlistUseCase {
  constructor(
    private readonly authService: TravellerAuthService,
    private readonly spotRepository: SpotRepository,
    private readonly shortlistRepository: ShortlistRepository,
  ) {}

  async execute(input: UpdateShortlistInput): Promise<UpdateShortlistOutput> {
    const traveller = await this.authService.authenticate(input.accessToken);

    const spot = await this.spotRepository.findById(input.spotId);
    if (spot === undefined) throw new SpotNotFoundError();

    const shortlist = await this.shortlistRepository.findByTravellerId(traveller.id);

    if (input.action === 'add') {
      shortlist.add(spot);
    } else {
      shortlist.remove(spot);
    }

    await this.shortlistRepository.save(traveller.id, shortlist);

    return { shortlistCount: shortlist.spots.length };
  }
}
