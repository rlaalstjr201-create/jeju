// Busan's part of the app (plans/busan.md budget, src/release.ts loadBusan): a chunk of its own, loaded only where Busan
// is in play. It hands release.ts the 12 areas, the boundary test and the 시작 화면's module.
import { BUSAN_AREAS, inBusan } from './busan';
import { installBusan } from './release';
import { mountStart } from '../start';

export function install(): void {
  installBusan({ areas: BUSAN_AREAS, inside: inBusan, mountStart });
}
