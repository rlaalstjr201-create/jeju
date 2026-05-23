#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
    for (const line of lines) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('='); if (eq === -1) continue;
      const key = t.slice(0, eq).trim(); const val = t.slice(eq + 1).trim();
      if (key && !(key in process.env)) process.env[key] = val;
    }
  } catch { /* no .env */ }
}
loadEnv();

const KEY = process.env['VISITJEJU_API_KEY']!;
const BASE = 'https://api.visitjeju.net/vsjApi/contents/searchList';

type RawItem = Record<string, unknown>;

async function fetchPage(category: string, page: number): Promise<{ totalCount: number; items: RawItem[] }> {
  const url = `${BASE}?locale=kr&apiKey=${KEY}&category=${category}&pageSize=100&page=${page}`;
  const res = await fetch(url);
  return res.json() as Promise<{ totalCount: number; items: RawItem[] }>;
}

function extractValue(v: unknown): string {
  if (v && typeof v === 'object' && 'value' in (v as object)) return String((v as Record<string, unknown>)['value']);
  return String(v ?? '(null)');
}

function flatObj(v: unknown): string {
  if (!v) return '(null)';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  return String(v);
}

// Collect distinct values for all fields across categories
const categories = ['c1', 'c4'];
const fieldSets: Record<string, Set<string>> = {};
const unknownEnumFields: Set<string> = new Set();
let totalItems = 0;

for (const cat of categories) {
  const first = await fetchPage(cat, 1);
  const totalCount = first.totalCount;
  const pages = Math.ceil(totalCount / 100);
  process.stdout.write(`\n=== category=${cat} (total ${totalCount}, ${pages} pages) ===\n`);

  const allItems: RawItem[] = [...first.items];
  // Fetch up to 5 pages (500 items) for enum survey
  for (let p = 2; p <= Math.min(pages, 5); p++) {
    const data = await fetchPage(cat, p);
    allItems.push(...data.items);
  }

  totalItems += allItems.length;

  // On first category, detect all object-type fields
  if (allItems.length > 0) {
    for (const [k, v] of Object.entries(allItems[0]!)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object)) {
        unknownEnumFields.add(k);
      }
    }
  }

  for (const item of allItems) {
    for (const [k, v] of Object.entries(item)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object)) {
        if (!fieldSets[k]) fieldSets[k] = new Set();
        fieldSets[k]!.add(extractValue(v));
      }
    }
  }

  // Sample: print first item's full top-level keys and their types
  if (allItems[0]) {
    process.stdout.write('Top-level keys in item[0]:\n');
    for (const [k, v] of Object.entries(allItems[0])) {
      const type = v && typeof v === 'object' && 'value' in (v as object)
        ? `{value} enum → ${extractValue(v)}`
        : Array.isArray(v) ? `array[${(v as unknown[]).length}]`
        : typeof v === 'object' && v !== null ? `object: ${flatObj(v).slice(0, 60)}`
        : `${typeof v}: ${String(v ?? '').slice(0, 60)}`;
      process.stdout.write(`  ${k}: ${type}\n`);
    }
  }
}

process.stdout.write(`\n=== Enum field distinct values (총 ${totalItems}건 조사) ===\n`);
for (const [field, vals] of Object.entries(fieldSets)) {
  process.stdout.write(`\n[${field}]\n`);
  for (const v of [...vals].sort()) {
    process.stdout.write(`  "${v}"\n`);
  }
}

process.stdout.write('\n=== 어댑터 미포착 object-type 필드 ===\n');
const adapterFields = new Set(['contentscd', 'region1cd', 'region2cd']);
for (const f of unknownEnumFields) {
  if (!adapterFields.has(f)) process.stdout.write(`  ⚠️  ${f} — 어댑터에서 flattenValue 미적용\n`);
}
if ([...unknownEnumFields].every(f => adapterFields.has(f))) {
  process.stdout.write('  없음 — 어댑터 커버리지 완전\n');
}
