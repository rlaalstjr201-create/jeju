// 라이트하우스 3쪽×3번 측정 → 중앙값 요약 JSON (docs/perf/lighthouse-criteria.md 절차)
// 사용: node docs/perf/lh.mjs <출력.json> [기준 주소=https://yeochana.pages.dev] [쪽 목록]
// 원본 리포트는 OS 임시 폴더(lh-raw-*)에 남고 저장소에는 요약만 쓴다.
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2];
const base = (process.argv[3] ?? 'https://yeochana.pages.dev').replace(/\/$/, '');
if (!out) throw new Error('출력 파일 경로가 필요합니다');
// 셋째 인자(쉼표 구분)는 로컬 확인용으로 쪽을 줄일 때만 쓴다. 공식 전·후 측정은 기본 3쪽.
const PAGES = process.argv[4] ? process.argv[4].split(',') : ['/', '/jeju/', '/jeju/aewol/'];
const RUNS = 3;
const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];
const METRICS = {
  LCP: 'largest-contentful-paint',
  CLS: 'cumulative-layout-shift',
  TBT: 'total-blocking-time',
  FCP: 'first-contentful-paint',
  SI: 'speed-index',
};
const rawDir = mkdtempSync(join(tmpdir(), 'lh-raw-'));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function runOnce(url, file) {
  try {
    execSync(
      `npx lighthouse "${url}" --output=json --output-path="${file}" --quiet --chrome-flags="--headless=new"`,
      { stdio: 'inherit' },
    );
  } catch (err) {
    // Windows: Lighthouse can exit non-zero (EPERM) while removing Chrome's temp profile after the report is
    // written (audit 2026-10-15). The report decides, not the exit code; no report → the error stands.
    if (!existsSync(file)) throw err;
    console.error(`${url}: lighthouse exited ${err.status ?? '?'} after writing the report — using the report`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

function failing(lhr) {
  const res = [];
  for (const cat of CATS) {
    for (const ref of lhr.categories[cat].auditRefs) {
      const a = lhr.audits[ref.id];
      if (!a || a.score === null || a.score >= 0.9) continue;
      if (a.scoreDisplayMode === 'informative' || a.scoreDisplayMode === 'notApplicable') continue;
      if (ref.weight === 0 && a.scoreDisplayMode !== 'metricSavings') continue;
      res.push({ category: cat, id: a.id, score: a.score, weight: ref.weight, displayValue: a.displayValue ?? '' });
    }
  }
  return res.sort((x, y) => y.weight - x.weight || x.score - y.score);
}

const pages = {};
for (const path of PAGES) {
  const url = base + path;
  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    const file = join(rawDir, `${path.replace(/\W+/g, '_') || 'root'}_${i}.json`);
    const lhr = runOnce(url, file);
    if (lhr.runtimeError) throw new Error(`${url}: ${lhr.runtimeError.code} ${lhr.runtimeError.message}`);
    const r = { scores: {}, metrics: {}, failing: failing(lhr) };
    for (const c of CATS) r.scores[c] = Math.round(lhr.categories[c].score * 100);
    for (const [k, id] of Object.entries(METRICS)) r.metrics[k] = lhr.audits[id].numericValue;
    runs.push(r);
    console.error(`${url} #${i}: ${JSON.stringify(r.scores)}`);
  }
  const med = { scores: {}, metrics: {} };
  for (const c of CATS) med.scores[c] = median(runs.map((r) => r.scores[c]));
  for (const k of Object.keys(METRICS)) {
    const v = median(runs.map((r) => r.metrics[k]));
    med.metrics[k] = k === 'CLS' ? Math.round(v * 1000) / 1000 : Math.round(v);
  }
  // 세 번 중 두 번 이상 걸린 실패 항목만 남긴다
  const count = new Map();
  for (const r of runs) for (const f of r.failing) {
    const key = `${f.category}:${f.id}`;
    const prev = count.get(key);
    count.set(key, { ...f, n: (prev?.n ?? 0) + 1 });
  }
  const topFailing = [...count.values()].filter((f) => f.n >= 2).slice(0, 12)
    .map(({ category, id, score, displayValue }) => ({ category, id, score, displayValue }));
  pages[path] = { url, median: med, runs: runs.map((r) => ({ scores: r.scores, metrics: r.metrics })), topFailing };
}

const summary = {
  measuredAt: new Date().toISOString(),
  tool: 'npx lighthouse (기본 모바일), 쪽마다 3번, 중앙값',
  base,
  rawDir,
  pages,
};
writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
console.error(`요약 → ${out}`);
