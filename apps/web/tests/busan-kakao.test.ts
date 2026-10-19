import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nameRule, pick, queryOf, run, type KakaoDoc, type Search } from '../scripts/busan/kakao.mjs';

// 부산 카카오 대조 S3b (review/busan/kakao-criteria.md)

const at = { lat: 35.1, lng: 129.1 };
// 위도 0.001도 ≈ 111m
const doc = (id: string, place_name: string, dLat = 0, extra: Partial<KakaoDoc> = {}): KakaoDoc => ({
  id,
  place_name,
  place_url: `http://place.map.kakao.com/${id}`,
  category_group_code: 'AT4',
  x: String(at.lng),
  y: String(at.lat + dLat),
  ...extra,
});
const sight = { title: '감천사(부산)', ...at, contenttypeid: 12, mood: 'new' };
const food = { title: '수영 돼지국밥', ...at, contenttypeid: 39, mood: 'food' };

describe('검색어와 이름 규칙 (2절·3절)', () => {
  it('괄호와 안 글자를 지운다, 비면 원래 이름', () => {
    expect(queryOf('감천사(부산)')).toBe('감천사');
    expect(queryOf('동래온천길(온천천 카페거리)')).toBe('동래온천길');
    expect(queryOf('(부산)')).toBe('(부산)');
  });
  it('exact: 공백·가운뎃점·앞의 부산은 무시', () => {
    expect(nameRule('부산 암남공원', '암남공원')).toBe('exact');
    expect(nameRule('망산도·유주암', '망산도 유주암')).toBe('exact');
    expect(nameRule('F1963', 'f1963')).toBe('exact');
  });
  it('contains: 짧은 쪽 두 글자 이상, 카카오 쪽 시설 꼬리는 뺀다', () => {
    expect(nameRule('사미헌', '사미헌 신관')).toBe('contains');
    expect(nameRule('해운대해수욕장', '해운대해수욕장 공영주차장')).toBeNull();
    expect(nameRule('해운대해수욕장', '해운대해수욕장 화장실2')).toBeNull();
    expect(nameRule('송정', '송정역 1번출구')).toBeNull();
    expect(nameRule('가', '가나다')).toBeNull();
    expect(nameRule('태종대', '오륙도')).toBeNull();
  });
});

describe('고르기 (3절)', () => {
  it('exact가 contains보다 앞, 같은 규칙이면 가까운 곳', () => {
    const r = pick(sight, [doc('1', '감천사 주지실', 0.001), doc('2', '감천사', 0.005), doc('3', '감천사', 0.002)]);
    expect(r).toEqual({ status: 'matched', rule: 'exact', kakaoPlaceId: '3', placeUrl: 'http://place.map.kakao.com/3' });
  });
  it('거리: 음식점 300m, 그 밖 1,000m', () => {
    expect(pick(food, [doc('1', '수영 돼지국밥', 0.004, { category_group_code: 'FD6' })]).status).toBe('unmatched');
    expect(pick(food, [doc('1', '수영 돼지국밥', 0.002, { category_group_code: 'FD6' })]).status).toBe('matched');
    expect(pick(sight, [doc('1', '감천사', 0.008)]).status).toBe('matched');
    expect(pick(sight, [doc('1', '감천사', 0.01)]).status).toBe('unmatched');
  });
  it('분류: 음식점은 FD6·CE7만, food 아닌 곳은 FD6·CE7 빼고, 주차장 등은 늘 뺀다', () => {
    expect(pick(food, [doc('1', '수영 돼지국밥')]).status).toBe('unmatched');
    expect(pick(sight, [doc('1', '감천사', 0, { category_group_code: 'FD6' })]).status).toBe('unmatched');
    expect(pick(sight, [doc('1', '감천사', 0, { category_group_code: 'PK6' })]).status).toBe('unmatched');
    expect(pick(sight, [doc('1', '감천사', 0, { category_group_code: '' })]).status).toBe('matched');
  });
  it('폐업 표시가 있으면 closed, 없으면 unmatched는 ID 없음', () => {
    expect(pick(sight, [doc('9', '감천사(폐업)')]).status).toBe('closed');
    expect(pick(sight, [])).toEqual({ status: 'unmatched', rule: 'none', kakaoPlaceId: null, placeUrl: null });
  });
});

describe('실행 (2절·4절)', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  const setup = (n: number) => {
    dir = mkdtempSync(join(tmpdir(), 'busan-kakao-'));
    mkdirSync(join(dir, 'judge-01'));
    const items = Array.from({ length: n }, (_, i) => ({ id: `bs-${100 + i}`, title: `곳${i}`, ...at, contenttypeid: 12 }));
    writeFileSync(join(dir, 'scope.json'), JSON.stringify({ items: [...items, { id: 'bs-999', title: '뺀곳', ...at, contenttypeid: 12 }] }));
    writeFileSync(
      join(dir, 'judge-01/out-01.json'),
      JSON.stringify([...items.map((it) => ({ id: it.id, keep: true, mood: 'new' })), { id: 'bs-999', keep: false }]),
    );
  };
  const hits: Search = async (query) => ({ status: 200, body: { documents: [doc(query, query)] } });
  const fast = { sleep: async () => {}, now: () => new Date('2026-10-19T03:00:00Z') };

  it('keep만 부르고, 저장은 id·place_url만, 다시 돌리면 0회', async () => {
    setup(3);
    const queries: string[] = [];
    const r = await run({ dir, search: async (q, a) => (queries.push(q), hits(q, a)), ...fast });
    expect(r.stopped).toBe('done');
    expect(r.calls).toBe(3);
    expect(queries).not.toContain('뺀곳');
    const out = JSON.parse(readFileSync(join(dir, 'kakao-01.json'), 'utf8'));
    expect(out.rows[0]).toEqual({ id: 'bs-100', query: '곳0', status: 'matched', rule: 'exact', kakaoPlaceId: '곳0', placeUrl: 'http://place.map.kakao.com/곳0' });
    expect(out.status.matched).toBe(3);
    expect(out.pass).toBe(true);
    expect(readFileSync(join(dir, 'kakao-calls.log'), 'utf8').trim().split('\n')).toHaveLength(3);
    const again = await run({ dir, search: hits, ...fast });
    expect(again.calls).toBe(0);
  });

  it('응답을 못 받으면 3번까지, 그래도 못 받은 곳은 쓰지 않고 다음에 이어 간다', async () => {
    setup(2);
    let n = 0;
    const flaky: Search = async (q, a) => (++n <= 3 ? { status: 503 } : hits(q, a));
    const r = await run({ dir, search: flaky, ...fast });
    expect(r.calls).toBe(4);
    expect(r.stopped).toBe('errors');
    expect(JSON.parse(readFileSync(join(dir, 'kakao-01.json'), 'utf8')).rows.map((x: { id: string }) => x.id)).toEqual(['bs-101']);
    const r2 = await run({ dir, search: hits, ...fast });
    expect(r2.calls).toBe(1);
    expect(r2.stopped).toBe('done');
  });

  it('401이면 바로 멈추고, KST 하루 한도에서 멈춘다', async () => {
    setup(3);
    expect((await run({ dir, search: async () => ({ status: 401 }), ...fast })).stopped).toBe('auth');
    rmSync(join(dir, 'kakao-calls.log'));
    const r = await run({ dir, search: hits, limit: 2, ...fast });
    expect(r.stopped).toBe('limit');
    expect(r.calls).toBe(2);
    expect(existsSync(join(dir, 'kakao-01.json'))).toBe(true);
  });
});
