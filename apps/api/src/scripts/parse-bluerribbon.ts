/**
 * 블루리본 서베이 HTML → JSON 파서
 *
 * 입력: data/raw/awards/bluerribbon/*.html  (32 페이지)
 * 출력: data/processed/bluerribbon_jeju.json
 *
 * 실행: npx tsx src/scripts/parse-bluerribbon.ts
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const INPUT_DIR  = path.join(ROOT, 'data', 'raw', 'awards', 'bluerribbon');
const OUTPUT_DIR = path.join(ROOT, 'data', 'processed');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'bluerribbon_jeju.json');

interface BluerRibbonEntry {
  sourceId: string;   // href (예: /restaurants/53664)
  name: string;
  address: string;
  foodtype: string[];
  ribbonCount: number;  // 0/1/2/3
  isRedRibbon: boolean; // 레드리본(코카콜라 협업) 여부
  label: string | null;
  description: string | null;
}

function parseHtmlFile(filePath: string): BluerRibbonEntry[] {
  const html = readFileSync(filePath, 'utf-8');
  const root = parse(html);
  const cards = root.querySelectorAll('.thumb-restaurant');
  const entries: BluerRibbonEntry[] = [];

  for (const card of cards) {
    const sourceId = (card.getAttribute('data-href') ?? '').trim();
    if (!sourceId) continue;

    const name = (card.querySelector('.header-name-row h3')?.text ?? '').trim();
    const address = (card.querySelector('.juso-info')?.text ?? '').trim();
    const foodtype = card.querySelectorAll('.foodtype li').map(el => el.text.trim()).filter(Boolean);

    // 리본 이미지 개수 카운트 (.img-ribbon 클래스 기준)
    const ribbonCount = card.querySelectorAll('.ribbons img.img-ribbon').length;

    // 레드리본 라벨 감지
    const labelEl = card.querySelector('.label-year');
    const label = labelEl ? labelEl.text.trim() || null : null;
    const isRedRibbon = !!card.querySelector('.label-red-ribbon') ||
                        (label?.includes('레드리본') ?? false);

    const description = (card.querySelector('.thumb-caption .content')?.text ?? '').trim() || null;

    if (!name) continue;

    entries.push({ sourceId, name, address, foodtype, ribbonCount, isRedRibbon, label, description });
  }

  return entries;
}

function main() {
  let htmlFiles: string[];
  try {
    htmlFiles = readdirSync(INPUT_DIR)
      .filter(f => f.endsWith('.html'))
      .sort();
  } catch {
    console.error(`[parse-bluerribbon] 입력 디렉토리 없음: ${INPUT_DIR}`);
    console.error('data/raw/awards/bluerribbon/ 폴더에 HTML 파일을 넣고 재실행하세요.');
    process.exit(1);
  }

  if (htmlFiles.length === 0) {
    console.error('[parse-bluerribbon] HTML 파일이 없습니다.');
    process.exit(1);
  }

  console.log(`[parse-bluerribbon] ${htmlFiles.length}개 HTML 파일 파싱 시작`);

  const bySourceId = new Map<string, BluerRibbonEntry>();
  let totalRaw = 0;

  for (const file of htmlFiles) {
    const entries = parseHtmlFile(path.join(INPUT_DIR, file));
    totalRaw += entries.length;
    for (const entry of entries) {
      if (!bySourceId.has(entry.sourceId)) {
        bySourceId.set(entry.sourceId, entry);
      }
    }
  }

  const deduped = Array.from(bySourceId.values());

  const stats = {
    rawTotal: totalRaw,
    dedupedTotal: deduped.length,
    byRibbonCount: [0, 1, 2, 3].map(n => ({
      ribbons: n,
      count: deduped.filter(e => e.ribbonCount === n && !e.isRedRibbon).length,
    })),
    redRibbonCount: deduped.filter(e => e.isRedRibbon).length,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify({ meta: stats, entries: deduped }, null, 2), 'utf-8');

  console.log('[parse-bluerribbon] 결과:');
  console.log(`  원본 합계: ${stats.rawTotal}건`);
  console.log(`  dedup 후:  ${stats.dedupedTotal}건`);
  for (const { ribbons, count } of stats.byRibbonCount) {
    console.log(`  리본 ${ribbons}개: ${count}건`);
  }
  console.log(`  레드리본:  ${stats.redRibbonCount}건`);
  console.log(`  출력: ${OUTPUT_FILE}`);
}

main();
