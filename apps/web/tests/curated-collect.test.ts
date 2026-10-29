import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESTS, collect } from '../scripts/curated/collect.mjs';

// 큐레이팅 상세 수집 (plans/nationwide.md C1)

const rec = (contentid: number, signgu: string, extra: Record<string, unknown> = {}) => ({
  id: `nt-${contentid}`,
  title: `곳${contentid}`,
  addr1: '',
  lDongRegnCd: '51',
  lDongSignguCd: signgu,
  lat: 37.5,
  lng: 127.1,
  contenttypeid: 12,
  image: '',
  modifiedtime: '20260101000000',
  ...extra,
});
const ok = (id: string) => ({ response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: { item: [{ contentid: id, cpyrhtDivCd: 'Type3' }] }, totalCount: 1 } } });
const bad = { response: { header: { resultCode: '0001', resultMsg: 'ERR' } } };

const dirs: string[] = [];
function setup(gangwon: ReturnType<typeof rec>[], seoul: ReturnType<typeof rec>[] = []) {
  const d = mkdtempSync(join(tmpdir(), 'curated-'));
  dirs.push(d);
  const nation = join(d, 'nation');
  mkdirSync(nation, { recursive: true });
  writeFileSync(join(nation, 'scope-51.json'), JSON.stringify({ items: gangwon }));
  writeFileSync(join(nation, 'scope-11.json'), JSON.stringify({ items: seoul }));
  mkdirSync(join(d, 'busan/raw'), { recursive: true });
  return { d, nation, busanLog: join(d, 'busan/raw/calls.log'), nationLog: join(nation, 'calls.log') };
}
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const now = () => new Date('2026-10-30T03:00:00Z'); // KST 2026-10-30
const line = (day = '2026-10-30') => `${day}\t00:00:00Z\tx\ty\tok\n`;

function fake(handler?: (id: string, n: number) => unknown) {
  const ids: string[] = [];
  const fetchJson = async (op: string, p: Record<string, string | number>) => {
    expect(op).toBe('detailCommon2');
    const id = String(p.contentId);
    ids.push(id);
    return handler ? handler(id, ids.filter((x) => x === id).length) : ok(id);
  };
  return { fetchJson, ids };
}

describe('큐레이팅 수집', () => {
  it('도시 순서(강릉 150 -> 속초 210 -> 양양 830 -> 춘천 110 -> 평창 760) 다음 서울', async () => {
    const t = setup(
      [rec(1, '110'), rec(2, '760'), rec(3, '150'), rec(4, '830'), rec(5, '210'), rec(6, '999')],
      [rec(20, '680', { lDongRegnCd: '11' }), rec(21, '110', { lDongRegnCd: '11' })],
    );
    const f = fake();
    const r = await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f.fetchJson, otherLogs: [t.busanLog, t.nationLog], now });
    expect(f.ids).toEqual(['3', '5', '4', '1', '2', '21', '20']); // 999(범위 밖 도시)는 안 받는다, 서울은 코드 순
    expect(r.stopped).toBe('done');
    expect(DESTS.map((x) => x.dest)).toEqual(['gangwon', 'seoul']);
  });

  it('하루 한도는 부산·전국·큐레이팅 로그를 합산한다', async () => {
    const t = setup(Array.from({ length: 10 }, (_, i) => rec(i + 1, '150')));
    writeFileSync(t.busanLog, line() + line() + line('2026-10-29'));
    writeFileSync(t.nationLog, line() + line());
    mkdirSync(join(t.d, 'curated'), { recursive: true });
    appendFileSync(join(t.d, 'curated/calls.log'), line());
    const f = fake();
    const r = await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f.fetchJson, otherLogs: [t.busanLog, t.nationLog], now, limit: 8 });
    // 오늘 이미 2+... 부산 2 + 전국 2 + 큐레이팅 1 = 5, 한도 8 -> 3회만
    expect(r.calls).toBe(3);
    expect(r.stopped).toBe('limit');
    const log = readFileSync(join(t.d, 'curated/calls.log'), 'utf8');
    expect(log.split('\n').filter((l) => l.startsWith('2026-10-30')).length).toBe(4);
    expect(log).not.toMatch(/http|key/i);
    const progress = JSON.parse(readFileSync(join(t.d, 'curated/progress.json'), 'utf8'));
    expect(progress.dests.gangwon.cities['150 강릉']).toEqual({ inScope: 10, detailed: 3, remaining: 7 });
    expect(progress.callsToday).toBe(8);
  });

  it('받은 것은 건너뛰고 modifiedtime이 바뀐 곳만 다시 받는다', async () => {
    const t = setup([rec(1, '150'), rec(2, '150'), rec(3, '150')]);
    const f1 = fake();
    await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f1.fetchJson, otherLogs: [], now });
    expect(f1.ids).toEqual(['1', '2', '3']);
    expect(existsSync(join(t.d, 'gangwon/raw/detail/2.json'))).toBe(true);
    writeFileSync(join(t.d, 'nation/scope-51.json'), JSON.stringify({ items: [rec(1, '150'), rec(2, '150', { modifiedtime: '20260202000000' }), rec(3, '150')] }));
    const f2 = fake();
    const r = await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f2.fetchJson, otherLogs: [], now });
    expect(f2.ids).toEqual(['2']);
    expect(r.calls).toBe(1);
  });

  it('실패는 로그에 남기고 한 번만 다시 시도, 그래도 실패면 다음으로 넘어간다', async () => {
    const t = setup([rec(1, '150'), rec(2, '150')]);
    const f = fake((id) => (id === '1' ? bad : ok(id)));
    const r = await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f.fetchJson, otherLogs: [], now });
    expect(f.ids).toEqual(['1', '1', '2']);
    expect(r.errors).toHaveLength(1);
    expect(r.stopped).toBe('done');
    expect(existsSync(join(t.d, 'gangwon/raw/detail/1.json'))).toBe(false);
    expect(readFileSync(join(t.d, 'curated/calls.log'), 'utf8')).toContain('detailCommon2\t1\tresultCode 0001');
    const p = JSON.parse(readFileSync(join(t.d, 'curated/progress.json'), 'utf8'));
    expect(p.dests.gangwon.remaining).toBe(1);
  });

  it('첫 시도 실패 후 재시도가 성공하면 저장한다', async () => {
    const t = setup([rec(1, '150')]);
    const f = fake((id, n) => (n === 1 ? bad : ok(id)));
    const r = await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f.fetchJson, otherLogs: [], now });
    expect(r.calls).toBe(2);
    expect(r.errors).toEqual([]);
    expect(existsSync(join(t.d, 'gangwon/raw/detail/1.json'))).toBe(true);
  });

  it('scope.json은 부산 모양에 nt- id와 detail 여부를 담는다', async () => {
    const t = setup([rec(1, '150'), rec(2, '210')]);
    const f = fake((id) => (id === '2' ? bad : ok(id)));
    await collect({ outDir: t.d, nationDir: t.nation, fetchJson: f.fetchJson, otherLogs: [], now });
    const scope = JSON.parse(readFileSync(join(t.d, 'gangwon/scope.json'), 'utf8'));
    expect(scope).toMatchObject({ places: 2, detailed: 1, counts: { 12: { inScope: 2, detailed: 1 } } });
    expect(scope.source).toContain('nt-');
    expect(scope.items[0]).toMatchObject({ id: 'nt-1', city: '강릉', detail: true, cpyrhtDivCd: 'Type3', contenttypeid: 12, lat: 37.5, lng: 127.1, modifiedtime: '20260101000000' });
    expect(scope.items[1]).toMatchObject({ id: 'nt-2', detail: false });
    const saved = JSON.parse(readFileSync(join(t.d, 'gangwon/raw/detail/1.json'), 'utf8'));
    expect(Object.keys(saved)).toEqual(['contentid', 'modifiedtime', 'fetchedAt', 'body']);
  });
});
