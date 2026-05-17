import type { Traveller } from '../../domain/traveller/Traveller.js';

export interface AuthService {
  authenticate(accessToken: string): Promise<Traveller>;
}
