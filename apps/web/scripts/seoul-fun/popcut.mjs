/**
 * 서울 즐길 거리 인기 자르기 (criteria-07.md 3절). candidates-01.json의 이름을 네이버 검색광고 keywordstool로 한 번 잰다.
 *   node scripts/seoul-fun/popcut.mjs           → review/seoul-fun/pop-01.json (있으면 멈춘다: 한 번만)
 *   node scripts/seoul-fun/popcut.mjs --cut     pop-01.json으로 자르기만 → review/seoul-fun/judge-input-01.json (호출 없음)
 * 키는 .env의 NAVER_AD_*이고 출력·파일 어디에도 남기지 않는다.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, volume03 } from '../famous-measure.mjs';
import { callWithRetry } from '../busan/measure.mjs';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../review/seoul-fun');
export const K = { 루프탑: 60, 포장마차: 40, 전통시장: 50, LP바: 60, 찜질방: 40, 보드게임카페: 30, 재즈바: 40, 편집샵: 60, 빈티지샵: 40, 레코드샵: 40, 방탈출: 60, 볼링장: 30, 클라이밍: 40, 소극장: 80 };
// 한글·영문·숫자만(괄호·기호가 섞이면 keywordstool이 묶음 전체를 거절한다)
export const kw = (name) => String(name).replace(/[^0-9A-Za-z가-힣]/g, '').toUpperCase();
const cand = JSON.parse(readFileSync(resolve(dir, 'candidates-01.json'), 'utf8')).places;
const popPath = resolve(dir, 'pop-01.json');

if (process.argv.includes('--cut')) {
  const pop = JSON.parse(readFileSync(popPath, 'utf8')).volume;
  const byWord = new Map();
  cand.forEach((p, i) => {
    if (!byWord.has(p.word)) byWord.set(p.word, []);
    byWord.get(p.word).push({ ...p, i, vol: pop[kw(p.name)] ?? null });
  });
  const keep = [];
  for (const [word, list] of byWord) {
    const k = K[word] ?? Infinity;
    keep.push(...list.sort((a, b) => (b.vol ?? -1) - (a.vol ?? -1) || a.i - b.i).slice(0, k));
  }
  keep.sort((a, b) => a.i - b.i);
  const places = keep.map(({ i, ...p }) => p);
  writeFileSync(resolve(dir, 'judge-input-01.json'), JSON.stringify({ n: places.length, places }, null, 1) + '\n');
  console.log(JSON.stringify({ before: cand.length, after: places.length }));
} else {
  if (existsSync(popPath)) throw new Error('pop-01.json exists (one run only)');
  const keys = { customer: env('NAVER_AD_CUSTOMER_ID'), api: env('NAVER_AD_API_KEY'), secret: env('NAVER_AD_SECRET_KEY') };
  if (!keys.customer || !keys.api || !keys.secret) throw new Error('NAVER_AD_* missing');
  // 자를 검색어의 이름만 잰다(나머지는 모두 남으므로)
  const words = [...new Set(cand.filter((p) => K[p.word]).map((p) => kw(p.name)))].filter((w) => w.length >= 2 && w.length <= 40);
  const volume = {};
  let calls = 0;
  let failed = 0;
  for (let i = 0; i < words.length; i += 5) {
    const batch = words.slice(i, i + 5);
    const r = await callWithRetry(batch, keys);
    calls += r.tries;
    if (!r.rows) failed += batch.length;
    for (const row of r.rows ?? []) {
      const k = kw(row.relKeyword);
      if (batch.includes(k)) volume[k] = volume03(row);
    }
    await new Promise((s) => setTimeout(s, 500));
  }
  writeFileSync(popPath, JSON.stringify({ asked: words.length, calls, failed, volume }, null, 1) + '\n');
  console.log(JSON.stringify({ asked: words.length, calls, failed, measured: Object.keys(volume).length }));
}
