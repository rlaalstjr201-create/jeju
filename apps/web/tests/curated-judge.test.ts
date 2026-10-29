import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error mjs 도구
import { batchesOf, buildItems, drawSample, paths, problems } from '../scripts/curated/judge.mjs';

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'cj-'));
  const P = paths('gangwon', '강릉', root);
  mkdirSync(resolve(P.base, 'raw', 'detail'), { recursive: true });
  const items: unknown[] = [];
  for (let i = 0; i < 52; i++) {
    const cid = String(1000 + i);
    items.push({ id: `nt-${cid}`, title: `장소 ${i}`, addr1: '강릉시', contenttypeid: i % 2 ? 39 : 12, lclsSystm3: 'X', city: '강릉' });
    writeFileSync(P.detail(cid), JSON.stringify({ body: { response: { body: { items: { item: [{ overview: `개요  ${i}\n순두부를 낸다`, cat3: 'C' }] } } } } }));
  }
  items.push({ id: 'nt-9', title: '속초 곳', addr1: '속초시', contenttypeid: 12, city: '속초' });
  items.push({ id: 'nt-8', title: '상세 없음', addr1: '강릉시', contenttypeid: 12, city: '강릉' });
  writeFileSync(P.scope, JSON.stringify({ items }));
  return P;
}

describe('curated judge', () => {
  it('prep: 그 도시 + 상세 있는 곳만, 종류·id 순, 50곳씩', () => {
    const items = buildItems(fixture(), '강릉');
    expect(items).toHaveLength(52);
    expect(items[0].contenttypeid).toBe(12);
    expect(items[0].overview).toBe('개요 0 순두부를 낸다');
    expect(items[items.length - 1].contenttypeid).toBe(39);
    const b = batchesOf(items);
    expect(b.map((x: unknown[]) => x.length)).toEqual([50, 2]);
  });

  it('check: 정상 판정은 문제 없고 위반은 잡는다', () => {
    const item = { id: 'nt-1', name: '순두부집', contenttypeid: 39, overview: '초당 순두부와 두부전골을 낸다' };
    const ok = { id: 'nt-1', name: '순두부집', keep: true, mood: 'food', sub: 'meal', indoor: true, reason: '순두부와 두부전골을 내는 집이에요', basis: ['순두부와 두부전골'], confidence: 'high' };
    expect(problems(item, ok)).toEqual([]);
    expect(problems(item, undefined)).toEqual(['판정 없음']);
    expect(problems(item, { ...ok, basis: ['없는 문장'] }).join()).toContain('원문에 없음');
    expect(problems(item, { ...ok, mood: 'walk', sub: undefined }).join()).toContain('음식점인데 food 아님');
    expect(problems(item, { ...ok, reason: '순두부와 두부전골을 내는 집이에요.' }).length).toBeGreaterThan(0);
    expect(problems(item, { id: 'nt-1', name: '순두부집', keep: false, reject: 'BAD', basis: [], confidence: 'low' }).join()).toContain('reject 코드');
  });

  it('sample: 씨앗 고정, 120 미만이면 전부', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `nt-${i}`);
    expect(drawSample(ids)).toEqual(drawSample([...ids].reverse()));
    expect(drawSample(ids)).toHaveLength(120);
    expect(drawSample(ids.slice(0, 50))).toHaveLength(50);
  });
});
