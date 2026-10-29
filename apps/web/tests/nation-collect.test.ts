import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TourItem } from '../scripts/busan/collect.mjs';
import { collect, scopeRecord, spotId } from '../scripts/nation/collect.mjs';

// 전국 목록 수집 (plans/nationwide.md N1)

const item = (contentid: number, contenttypeid: number, extra: Record<string, unknown> = {}): TourItem =>
  ({ contentid: String(contentid), contenttypeid: String(contenttypeid), title: `곳${contentid}`, mapx: '127.1', mapy: '37.5', lDongSignguCd: '110', modifiedtime: '20260101000000', ...extra }) as TourItem;
const ok = (items: unknown[], totalCount = items.length) => ({
  response: { header: { resultCode: '0000', resultMsg: 'OK' }, body: { items: items.length ? { item: items } : '', totalCount } },
});

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'nation-'));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
const now = () => new Date('2026-10-30T03:00:00Z');

function fake(onCall?: (op: string, p: Record<string, string | number>) => void) {
  const seen: Array<{ op: string; p: Record<string, string | number> }> = [];
  const fetchJson = async (op: string, p: Record<string, string | number>) => {
    seen.push({ op, p });
    onCall?.(op, p);
    if (op === 'lclsSystmCode2') return ok([{ lclsSystm1Cd: 'VE', lclsSystm1Nm: '자연', lclsSystm2Cd: 'VE01', lclsSystm2Nm: '자연관광', lclsSystm3Cd: 'VE0101', lclsSystm3Nm: '해변' }]);
    const page = Number(p.pageNo);
    const type = Number(p.contentTypeId);
    if (type === 12) return ok([item(page * 10 + 1, 12, { lclsSystm3: 'VE0101', lDongRegnCd: String(p.lDongRegnCd) })], 1500);
    if (type === 38) return ok([item(900, 38, { lclsSystm3: 'SH060100' }), item(901, 38, { lclsSystm3: 'SH010100' })]);
    return ok([]);
  };
  return { fetchJson, seen };
}

describe('전국 수집', () => {
  it('쪽을 totalCount로 넘기고, 받은 쪽은 다시 받지 않는다', async () => {
    const dir = tmp();
    const f = fake();
    const r = await collect({ dir, fetchJson: f.fetchJson, now, sidos: [11] });
    expect(r.stopped).toBe('done');
    const t12 = f.seen.filter((s) => s.p.contentTypeId === 12);
    expect(t12.map((s) => s.p.pageNo)).toEqual([1, 2]);
    expect(f.seen.filter((s) => s.op === 'areaBasedList2').every((s) => s.p.numOfRows === 1000 && s.p.lDongRegnCd === 11)).toBe(true);
    const f2 = fake();
    const r2 = await collect({ dir, fetchJson: f2.fetchJson, now, sidos: [11] });
    expect(r2.calls).toBe(0);
    expect(f2.seen).toHaveLength(0);
  });

  it('범위 레코드 모양과 id 접두사, 쇼핑은 전통시장만', async () => {
    const dir = tmp();
    await collect({ dir, fetchJson: fake().fetchJson, now, sidos: [11] });
    const scope = JSON.parse(readFileSync(join(dir, 'scope-11.json'), 'utf8'));
    expect(scope.total).toBe(scope.items.length);
    expect(scope.lDongRegnCd).toBe('11');
    const ids = scope.items.map((i: { id: string }) => i.id);
    expect(ids.every((i: string) => i.startsWith('nt-'))).toBe(true);
    expect(ids).toContain('nt-900');
    expect(ids).not.toContain('nt-901');
    const rec = scope.items.find((i: { id: string }) => i.id === 'nt-11');
    expect(rec).toMatchObject({ id: 'nt-11', title: '곳11', lDongRegnCd: '11', lDongSignguCd: '110', lat: 37.5, lng: 127.1, contenttypeid: 12, lclsSystm3: 'VE0101', image: '', modifiedtime: '20260101000000' });
    expect(spotId(item(5, 12))).toBe('nt-5');
    expect(scopeRecord(item(5, 12, { cat1: 'A01' }), 11).cat1).toBe('A01');
    expect(scopeRecord(item(5, 12), 11)).not.toHaveProperty('cat1');
  });

  it('매니페스트·분류표·호출 기록(주소·키 없이)을 남긴다', async () => {
    const dir = tmp();
    await collect({ dir, fetchJson: fake().fetchJson, now, sidos: [11] });
    const m = JSON.parse(readFileSync(join(dir, 'raw-manifest.json'), 'utf8'));
    expect(m.files.find((x: { file: string }) => x.file === 'list-11-12.json')).toMatchObject({ pages: 2, totalCount: 1500, items: 2 });
    expect(m.files.every((x: { sha256: string }) => /^[0-9a-f]{64}$/.test(x.sha256))).toBe(true);
    const cats = JSON.parse(readFileSync(join(dir, 'categories.json'), 'utf8'));
    expect(cats.lclsSystm3.VE0101).toMatchObject({ name: '해변', byType: { 12: 2 } });
    const log = readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n');
    expect(log[0]).toMatch(/^2026-10-30\t\d\d:\d\d:\d\dZ\tareaBasedList2\t11:12:1\tok$/);
    expect(log.some((l) => l.includes('lclsSystmCode2'))).toBe(true);
    expect(readFileSync(join(dir, 'raw/calls.log'), 'utf8')).toBe(`${log.join('\n')}\n`);
  });

  it('하루 한도는 부산 로그와 합산해 멈춘다', async () => {
    const dir = tmp();
    const busan = join(dir, 'busan-calls.log');
    writeFileSync(busan, '2026-10-30\tx\tdetailCommon2\t1\tok\n'.repeat(8) + '2026-10-29\tx\tdetailCommon2\t1\tok\n'.repeat(50));
    mkdirSync(join(dir, 'raw'), { recursive: true });
    appendFileSync(join(dir, 'calls.log'), '2026-10-30\tx\tareaBasedList2\t1\tok\n');
    const f = fake();
    const r = await collect({ dir, fetchJson: f.fetchJson, busanLog: busan, now, limit: 12, sidos: [11] });
    expect(r.stopped).toBe('limit');
    expect(r.calls).toBe(3); // 8 + 1 + 3 = 12
    expect(r.message).toContain('한도');
    expect(existsSync(join(dir, 'raw/list-11-12.json'))).toBe(true); // 12종 두 쪽은 저장됨
    expect(existsSync(join(dir, 'raw/list-11-14.json'))).toBe(true);
    expect(existsSync(join(dir, 'raw/list-11-28.json'))).toBe(false);
  });

  it('실패하면 다시 시도하지 않고 멈추며, 기록에 error를 남긴다', async () => {
    const dir = tmp();
    const f = fake((op) => {
      if (op === 'areaBasedList2') throw new Error('boom');
    });
    const r = await collect({ dir, fetchJson: f.fetchJson, now, sidos: [11] });
    expect(r.stopped).toBe('error');
    expect(f.seen).toHaveLength(1);
    expect(readFileSync(join(dir, 'calls.log'), 'utf8')).toMatch(/\terror\n$/);
  });
});
