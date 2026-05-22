#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}
loadEnv();

const SEARCH_NAMES = ['협재해수욕장', '주상절리', '동문시장', '카멜리아힐', '만장굴'];
const apiKey = process.env['VISITJEJU_API_KEY']!;

interface ApiItem { title: string; contentsid: string; introduction: string; latitude: string; longitude: string; }
interface ApiResponse { items: ApiItem[]; totalCount: number; currentPage: number; pageSize: number; }

async function scanCategory(cat: string): Promise<void> {
  let page = 1, fetched = 0, totalCount: number | undefined;
  do {
    const url = `https://api.visitjeju.net/vsjApi/contents/searchList?apiKey=${apiKey}&locale=kr&pageSize=100&page=${page}&category=${cat}`;
    const data = await fetch(url).then((r) => r.json()) as ApiResponse;
    if (!data.items?.length) break;
    for (const item of data.items) {
      const title = item.title ?? '';
      const match = SEARCH_NAMES.find((n) => title.includes(n));
      if (match) {
        const introLen = (item.introduction ?? '').length;
        const hasCoords = !!(item.latitude && item.longitude);
        const passFilter = introLen >= 30 && hasCoords;
        process.stdout.write(`[${cat}] "${title.padEnd(20)}" ${item.contentsid}  intro=${introLen}  coords=${hasCoords}  filter=${passFilter ? 'PASS' : 'FAIL'}\n`);
      }
    }
    fetched += data.items.length;
    totalCount = data.totalCount;
    page++;
  } while (totalCount !== undefined && fetched < totalCount);
}

process.stdout.write('=== c1 scan ===\n');
await scanCategory('c1');
process.stdout.write('\n=== c4 scan ===\n');
await scanCategory('c4');
process.stdout.write('\nDone.\n');
