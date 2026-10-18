import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callsOn, collect, imageOf, inScope, kstDay, needsDetail, pageCount, spotId, toHttps, type TourItem } from '../scripts/busan/collect.mjs';

// 부산 수집 (plans/busan.md S2, specs/busan.md 3.1·3.2)

const item = (contentid: number, contenttypeid: number, extra: Partial<TourItem> = {}): TourItem => ({
  contentid: String(contentid),
  contenttypeid: String(contenttypeid),
  title: `곳${contentid}`,
  mapx: '129.1',
  mapy: '35.1',
  modifiedtime: '20260101000000',
  ...extra,
});
const ok = (items: TourItem[], totalCount = items.length) => ({
  response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: items.length ? { item: items } : '', totalCount } },
});

describe('장소 범위 (3.2)', () => {
  it('관광지·문화시설·레포츠·음식점은 넣고, 쇼핑은 SH060100·SH060200만, 축제·숙박·코스는 뺀다', () => {
    for (const t of [12, 14, 28, 39]) expect(inScope(item(1, t))).toBe(true);
    expect(inScope(item(1, 38, { lclsSystm3: 'SH060100' }))).toBe(true);
    expect(inScope(item(1, 38, { lclsSystm3: 'SH060200' }))).toBe(true);
    for (const l of ['SH010100', 'SH020200', 'SH040100', 'SH030100', 'SH050300', 'SH070100', undefined]) {
      expect(inScope(item(1, 38, { lclsSystm3: l }))).toBe(false);
    }
    for (const t of [15, 32, 25]) expect(inScope(item(1, t))).toBe(false);
  });
});

describe('레코드', () => {
  it('id는 bs-<contentid>', () => expect(spotId(item(126081, 12))).toBe('bs-126081'));
  it('사진 firstimage → firstimage2 → "", http는 https로', () => {
    expect(imageOf(item(1, 12, { firstimage: 'http://tong.visitkorea.or.kr/a.jpg', firstimage2: 'http://x/b.jpg' }))).toBe('https://tong.visitkorea.or.kr/a.jpg');
    expect(imageOf(item(1, 12, { firstimage: '', firstimage2: 'http://x/b.jpg' }))).toBe('https://x/b.jpg');
    expect(imageOf(item(1, 12))).toBe('');
    expect(toHttps('https://a/b')).toBe('https://a/b');
  });
  it('modifiedtime이 바뀐 곳만 상세를 다시 받는다', () => {
    expect(needsDetail(item(1, 12), null)).toBe(true);
    expect(needsDetail(item(1, 12), { modifiedtime: '20260101000000' })).toBe(false);
    expect(needsDetail(item(1, 12, { modifiedtime: '20260301000000' }), { modifiedtime: '20260101000000' })).toBe(true);
  });
  it('KST 날짜와 그날 호출 수', () => {
    expect(kstDay(new Date('2026-10-18T15:30:00Z'))).toBe('2026-10-19');
    expect(kstDay(new Date('2026-10-18T14:59:00Z'))).toBe('2026-10-18');
    expect(callsOn('2026-10-18\ta\n2026-10-18\tb\n2026-10-19\tc\n', '2026-10-18')).toBe(2);
    expect(pageCount(1000)).toBe(1);
    expect(pageCount(1001)).toBe(2);
    expect(pageCount(0)).toBe(1);
  });
});

describe('collect', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  const now = () => new Date('2026-10-18T03:00:00Z');

  /** 종류마다 places[type] 목록을 돌려주는 가짜 TourAPI. 받은 호출을 기록한다. */
  function fake(places: Record<number, TourItem[]>, rows = 1000) {
    const seen: string[] = [];
    const fetchJson = async (op: string, p: Record<string, string | number>) => {
      seen.push(`${op}:${p.contentTypeId ?? p.contentId}:${p.pageNo ?? ''}`);
      if (op === 'areaBasedList2') {
        const all = places[Number(p.contentTypeId)] ?? [];
        const page = Number(p.pageNo);
        return ok(all.slice((page - 1) * rows, page * rows), all.length);
      }
      return ok([{ ...item(Number(p.contentId), 12), overview: '개요' } as TourItem]);
    };
    return { seen, fetchJson };
  }

  it('범위 안만 상세를 받고, 다시 돌리면 받은 것은 건너뛴다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    const places = { 12: [item(1, 12), item(2, 12)], 38: [item(3, 38, { lclsSystm3: 'SH060200' }), item(4, 38, { lclsSystm3: 'SH040100' })], 39: [item(5, 39)] };
    const a = fake(places);
    const r1 = await collect({ dir, fetchJson: a.fetchJson, now });
    expect(r1.stopped).toBe('done');
    expect(a.seen.filter((s) => s.startsWith('detailCommon2')).sort()).toEqual(['detailCommon2:1:', 'detailCommon2:2:', 'detailCommon2:3:', 'detailCommon2:5:']);
    expect(r1.calls).toBe(5 + 4);
    const scope = JSON.parse(readFileSync(join(dir, 'scope.json'), 'utf8'));
    expect(scope.items.map((p: { id: string }) => p.id)).toEqual(['bs-1', 'bs-2', 'bs-3', 'bs-5']);
    expect(scope.detailed).toBe(4);
    expect(callsOn(readFileSync(join(dir, 'raw/calls.log'), 'utf8'), '2026-10-18')).toBe(9);

    const b = fake(places);
    const r2 = await collect({ dir, fetchJson: b.fetchJson, now });
    expect(r2.calls).toBe(0);
    expect(b.seen).toEqual([]);
  });

  it('--types로 고른 종류만 상세를 받고, 나머지는 다음 날 이어 받는다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    const places = { 12: [item(1, 12)], 39: [item(5, 39)] };
    const a = fake(places);
    await collect({ dir, fetchJson: a.fetchJson, now, types: [12, 14, 28, 38] });
    expect(a.seen.filter((s) => s.startsWith('detail'))).toEqual(['detailCommon2:1:']);
    const b = fake(places);
    await collect({ dir, fetchJson: b.fetchJson, now: () => new Date('2026-10-19T03:00:00Z') });
    expect(b.seen).toEqual(['detailCommon2:5:']);
  });

  it('KST 하루 한도에서 멈추고, 날이 바뀌면 이어 간다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    const places = { 12: [1, 2, 3, 4, 5, 6].map((n) => item(n, 12)) };
    const r1 = await collect({ dir, fetchJson: fake(places).fetchJson, now, limit: 8 });
    expect(r1.stopped).toBe('limit');
    expect(r1.calls).toBe(8);
    expect(existsSync(join(dir, 'raw/detail/3.json'))).toBe(true);
    expect(existsSync(join(dir, 'raw/detail/4.json'))).toBe(false);
    const again = fake(places);
    const r2 = await collect({ dir, fetchJson: again.fetchJson, now, limit: 8 });
    expect(r2.calls).toBe(0);
    expect(again.seen).toEqual([]);
    const next = fake(places);
    const r3 = await collect({ dir, fetchJson: next.fetchJson, now: () => new Date('2026-10-18T16:00:00Z'), limit: 8 });
    expect(r3.stopped).toBe('done');
    expect(next.seen).toEqual(['detailCommon2:4:', 'detailCommon2:5:', 'detailCommon2:6:']);
  });

  it('totalCount가 numOfRows를 넘으면 쪽을 넘긴다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    const many = Array.from({ length: 1001 }, (_, i) => item(i + 1, 39));
    const a = fake({ 39: many });
    await collect({ dir, fetchJson: a.fetchJson, now, types: [] });
    expect(a.seen.filter((s) => s.startsWith('areaBasedList2:39'))).toEqual(['areaBasedList2:39:1', 'areaBasedList2:39:2']);
    const list = JSON.parse(readFileSync(join(dir, 'raw/list-39.json'), 'utf8'));
    expect(list.pages).toHaveLength(2);
  });

  it('--refresh 때 modifiedtime이 바뀐 곳만 상세를 다시 받는다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    await collect({ dir, fetchJson: fake({ 12: [item(1, 12), item(2, 12)] }).fetchJson, now });
    const b = fake({ 12: [item(1, 12), item(2, 12, { modifiedtime: '20261001000000' })] });
    const r = await collect({ dir, fetchJson: b.fetchJson, now, refresh: true });
    expect(r.calls).toBe(5 + 1);
    expect(b.seen.filter((s) => s.startsWith('detail'))).toEqual(['detailCommon2:2:']);
  });

  it('실패하면 다시 시도하지 않고 멈추며, 받은 것은 남는다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    const places = { 12: [item(1, 12), item(2, 12)] };
    const base = fake(places).fetchJson;
    let n = 0;
    const flaky = async (op: string, p: Record<string, string | number>) => {
      if (op === 'detailCommon2' && ++n === 2) return { response: { header: { resultCode: '22', resultMsg: 'LIMITED' } } };
      return base(op, p);
    };
    const r = await collect({ dir, fetchJson: flaky, now });
    expect(r.stopped).toBe('error');
    expect(r.calls).toBe(7);
    expect(existsSync(join(dir, 'raw/detail/1.json'))).toBe(true);
    expect(readFileSync(join(dir, 'raw/calls.log'), 'utf8')).toContain('resultCode 22');
  });

  it('calls.log에 주소·키가 없다', async () => {
    dir = mkdtempSync(join(tmpdir(), 'busan-'));
    await collect({ dir, fetchJson: fake({ 12: [item(1, 12)] }).fetchJson, now });
    const log = readFileSync(join(dir, 'raw/calls.log'), 'utf8');
    expect(log).not.toMatch(/serviceKey|https?:/);
  });
});
