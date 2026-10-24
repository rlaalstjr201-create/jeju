// Owner rule (2026-10-17, docs/i18n/style-*.md 「한국 문화·영토 용어」): Korean food, dress, places and history are
// never written in the words that frame them as Chinese or Japanese. Every shipped translation is checked.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
/** banned in every language (a term is banned wherever it appears; Korean has its own words) */
const COMMON = [/Sea of Japan/i, /Takeshima/i, /Liancourt/i, /Changbai/i, /Hanfu/i, /竹島|竹岛/, /日本海/, /長白山|长白山/];
const BANNED: Record<string, RegExp[]> = {
  en: [...COMMON, /pao ?cai/i],
  // 한국관광공사 is 韩国旅游发展局 in Chinese, its own site's name (place-terms.md, review 2026-10-20 n2)
  'zh-Hans': [...COMMON, /泡菜/, /汉服|漢服/, /朝鲜族|朝鮮族/, /鲜族服饰/, /韩国观光公社|韓國觀光公社/],
  ja: [...COMMON, /パオツァイ/, /泡菜/, /漢服|汉服/, /朝鮮族|朝鲜族/],
};
const files = (lang: string): string[] => {
  const out = [resolve(root, `src/i18n/${lang}.ts`), resolve(root, `public/i18n/places.${lang}.json`), resolve(root, `public/i18n/places-busan.${lang}.json`), resolve(root, `public/privacy-${lang}.html`)];
  // Jeju's batches and Busan's (ADR-0093 Amendment 9)
  for (const dir of [resolve(root, `review/i18n/${lang}`), resolve(root, `review/i18n/busan/${lang}`)])
    if (existsSync(dir)) out.push(...readdirSync(dir).map((f) => resolve(dir, f)));
  return out.filter((f) => existsSync(f));
};

describe('Korean cultural and territorial terms in the translations', () => {
  for (const [lang, banned] of Object.entries(BANNED)) {
    it(`${lang}: Busan's place file and batches are among the files checked`, () => {
      expect(files(lang).filter((f) => /busan/.test(f)).length).toBeGreaterThanOrEqual(15);
    });
    it(`${lang}: none of the banned terms in its UI, place texts (Jeju and Busan), batches or privacy notice`, () => {
      const found: string[] = [];
      for (const f of files(lang)) {
        const text = readFileSync(f, 'utf8');
        for (const re of banned) {
          const m = text.match(new RegExp(re.source, `${re.flags}g`));
          if (m) found.push(`${f.slice(root.length + 1)}: ${m.join(', ')}`);
        }
      }
      expect(found).toEqual([]);
    });
  }

  it('the kimchi and Baekdusan words are the official ones where they appear', () => {
    const zh = readFileSync(resolve(root, 'public/i18n/places.zh-Hans.json'), 'utf8');
    expect(zh).toContain('辛奇');
    expect(zh).toContain('白头山');
    expect(readFileSync(resolve(root, 'public/i18n/places.ja.json'), 'utf8')).toContain('白頭山');
    expect(readFileSync(resolve(root, 'public/i18n/places.en.json'), 'utf8')).toContain('Baekdusan');
  });
});
