import { randomUUID } from 'crypto'
import type { AuthProvider } from './AuthProvider.js'
import type { TravellerRepository } from '../../domain/ports/TravellerRepository.js'
import type { Traveller } from '../../domain/traveller/Traveller.js'
import { CalendarDate } from '../../domain/shared/CalendarDate.js'

export class TravellerAuthService {
  constructor(
    private readonly authProvider: AuthProvider,
    private readonly travellerRepository: TravellerRepository,
  ) {}

  // Verify token, find-or-create Traveller, return it.
  async authenticate(accessToken: string): Promise<Traveller> {
    const userInfo = await this.authProvider.verifyAccessToken(accessToken)

    const existing = await this.travellerRepository.findByKakaoId(userInfo.kakaoId)
    if (existing !== undefined) {
      return existing
    }

    const newTraveller: Traveller = {
      id: randomUUID(),
      kakaoId: userInfo.kakaoId,
      createdAt: CalendarDate.today(),
    }
    await this.travellerRepository.save(newTraveller)
    return newTraveller
  }
}
