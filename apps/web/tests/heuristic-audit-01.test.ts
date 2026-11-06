// 휴리스틱 점검 H1·H3 (docs/research/heuristic-audit-01/02-synthesis.md)
import { describe, expect, it } from 'vitest';
import { heldText, homeCopy } from '../src/copy';
import { initialState, type State } from '../src/state';

const TODAY = '2026-10-11';
const base = (o: Partial<Parameters<typeof initialState>[0]> = {}): State =>
  initialState({ basis: 'gps', region: null, stay: null, saved: [], hintSeen: true, offline: false, today: TODAY, ...o });

describe('H1 다른 날에 담은 곳', () => {
  const saved = [{ id: 'a', date: TODAY, order: 0 }];
  it('「내일」로 보면 오늘 담은 곳에 「오늘 담아 둠」', () => {
    expect(heldText(base({ saved, when: '2026-10-12' }), 'a')).toBe('오늘 담아 둠');
  });
  it('그 날에 담겨 있으면 없음, 아예 안 담았으면 없음', () => {
    expect(heldText(base({ saved }), 'a')).toBeNull();
    expect(heldText(base({ saved, when: '2026-10-12' }), 'b')).toBeNull();
  });
  it('내일·그 뒤 날짜·지난 날', () => {
    expect(heldText(base({ saved: [{ id: 'a', date: '2026-10-12', order: 0 }] }), 'a')).toBe('내일 담아 둠');
    expect(heldText(base({ saved: [{ id: 'a', date: '2026-10-14', order: 0 }] }), 'a')).toMatch(/^10월 14일.* 담아 둠$/);
    expect(heldText(base({ saved: [{ id: 'a', date: '2026-10-09', order: 0 }] }), 'a')).toBe('지난 날 담아 둠');
  });
});

describe('H3 첫 화면 문구가 기준을 따른다', () => {
  it('지금 + 내 위치: ADR-0077 Am.2 문장 그대로', () => {
    expect(homeCopy(base())).toEqual({ ask: '지금 뭐 하고 싶어요?', lede: '지금 내 위치 근처에서 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.' });
  });
  it('위치가 안 되면 동네를 고르라고', () => {
    expect(homeCopy({ ...base(), lastFail: 'denied' } as State).lede).toBe('동네를 고르면 그 근처에서 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 바로 길찾기로 가요.');
  });
  it('내일 · 애월', () => {
    expect(homeCopy(base({ basis: 'region', region: '애월', when: '2026-10-12' }))).toEqual({ ask: '내일 뭐 하고 싶어요?', lede: '애월 근처에서 내일 갈 만한 곳 3곳을 골라 드려요. 마음에 들면 하트로 담아 두세요.' });
  });
});
