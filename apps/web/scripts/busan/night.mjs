/**
 * 밤 산길 부산 회차 (plans/busan.md S6, ADR-0091, 규칙 review/busan/night/criteria.md): scripts/night.mjs의 같은 함수를
 * 부산 입력·경로로 부른다. 제주 review/night·public/spots.json은 읽지도 쓰지도 않는다.
 *
 *   node scripts/busan/night.mjs --candidates   public/spots-busan.json → review/busan/night/candidates.json
 *   node scripts/busan/night.mjs --sample       trail-NN.json → audit-NN-sample.json (판정 없이 이름·원문만)
 *   node scripts/busan/night.mjs --score        audit-NN-judgments.json → audit-NN.json
 *
 * 붙이기는 scripts/busan/build.mjs가 한다(applyNight, 통과한 회차의 true만).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidates, drawSample, loadNightCalls, roundProblems, scoreAudit } from '../night.mjs';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const NIGHT_DIR = resolve(webRoot, 'review/busan/night');
const SPOTS = resolve(webRoot, 'public/spots-busan.json');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** criteria.md 1절: 제주 낱말에서 `오름|곶자왈|올레`를 빼고 `산성`을 더한 것(specs/busan.md 4절). */
export const BUSAN_TRAIL_WORDS = /악$|악\)|산$|봉$|숲|휴양림|계곡|탐방|둘레길|등반|등산|정상|트레킹|산책로|산성/;
/** criteria.md 3절: 표본 씨앗과 한쪽 최대 수. */
export const SAMPLE_SEED = 20261020;
export const PER_MAX = 60;
/** criteria.md 3절: 한쪽 k곳이면 일치율 ≥ 95%, 첫 판정 true → 다시 판정 false ≤ floor(3k/60). */
export const sampleSide = (calls) => Math.min(PER_MAX, calls.filter((c) => c.trail).length, calls.filter((c) => !c.trail).length);
export const passRule = (k) => ({ min: 0.95, trueToFalseMax: Math.floor((3 * k) / 60) });

/** 판정 원문: 카드 이름과 TourAPI detailCommon2 overview(review/busan/raw/detail). night.mjs sourceText가 읽는 꼴로. */
export function nightInputs(spots, dir = resolve(webRoot, 'review/busan/raw/detail')) {
  return new Map(
    spots.map((s) => {
      const overview = read(resolve(dir, `${s.id.slice(3)}.json`)).body.response.body.items.item[0].overview ?? '';
      return [s.id, { id: s.id, name: s.name, tags: [], intro: null, comment: null, summary: overview }];
    }),
  );
}

const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const spots = read(SPOTS);
  const inputs = nightInputs(spots);
  if (process.argv.includes('--candidates')) {
    const list = candidates(spots, inputs, BUSAN_TRAIL_WORDS);
    writeFileSync(resolve(NIGHT_DIR, 'candidates.json'), `[\n${list.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`);
    const walk = list.filter((c) => c.mood === 'walk').length;
    console.log(`candidates ${list.length}: 걷기 ${walk}, others by word ${list.length - walk}`);
  } else {
    const { calls, round } = loadNightCalls(NIGHT_DIR);
    if (!round) throw new Error('no review/busan/night/trail-NN.json');
    const bad = roundProblems(calls, read(resolve(NIGHT_DIR, 'candidates.json')).map((c) => c.id), inputs);
    if (bad.length) throw new Error(`trail-${round}.json problems:\n${bad.join('\n')}`);
    const k = sampleSide(calls);
    if (process.argv.includes('--sample')) {
      const byId = new Map(spots.map((s) => [s.id, s]));
      const items = drawSample(calls, SAMPLE_SEED, k).map((id) => ({ id, name: byId.get(id).name, text: inputs.get(id).summary }));
      writeFileSync(resolve(NIGHT_DIR, `audit-${round}-sample.json`), `${JSON.stringify({ round, seed: SAMPLE_SEED, perSide: k, items }, null, 1)}\n`);
      console.log(`audit-${round}-sample.json: ${items.length} places (${k} a side, seed ${SAMPLE_SEED})`);
    } else if (process.argv.includes('--score')) {
      const sample = read(resolve(NIGHT_DIR, `audit-${round}-sample.json`));
      const ids = sample.items.map((i) => i.id);
      if (drawSample(calls, sample.seed, sample.perSide).join() !== ids.join()) throw new Error(`audit-${round}-sample.json is not what seed ${sample.seed} draws — was the round changed after the draw?`);
      const { agreement, rows } = scoreAudit(calls, ids, read(resolve(NIGHT_DIR, `audit-${round}-judgments.json`)), passRule(sample.perSide));
      const out = { round, date: kstDay(), criteria: 'review/busan/night/criteria.md', sample: `audit-${round}-sample.json (seed ${sample.seed}, ${sample.perSide} a side)`, judgments: `audit-${round}-judgments.json`, agreement, rows };
      writeFileSync(resolve(NIGHT_DIR, `audit-${round}.json`), `${JSON.stringify(out, null, 1)}\n`);
      console.log(`audit-${round}.json: agree ${agreement.agree}/${agreement.n}, true→false ${agreement.trueToFalse} (max ${agreement.trueToFalseMax}), pass ${agreement.pass}`);
    } else throw new Error('--candidates | --sample | --score');
  }
}
