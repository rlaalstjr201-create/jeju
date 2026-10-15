// ADR-0063 2: keeping saves without a login — backup link (# fragment), in-app browser detection, home-screen
// kind. Pure functions; the app wiring is in app.test.ts (ADR-0063 describe).
import { describe, expect, it } from 'vitest';
import { BACKUP_HASH, backupUrl, decodeBackup, encodeBackup, inAppOf, installHow, kakaoExternal, readBackup } from '../src/keep';
import { MAX_SAVED, mergeEntries } from '../src/store';
import type { SavedEntry } from '../src/types';
import { realSpots } from './fixtures';

const ids = realSpots.slice(0, 40).map((s) => s.id);
const e = (id: string, date: string, order: number): SavedEntry => ({ id, date, order });

describe('backup link: encode / decode', () => {
  it('round-trips ids, days and the order within each day (v2 data)', () => {
    const list = [e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-01', 1), e(ids[2], '2026-10-03', 0), e(ids[3], '2026-09-28', 0)];
    const back = decodeBackup(encodeBackup(list));
    expect(back).toEqual([e(ids[3], '2026-09-28', 0), e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-01', 1), e(ids[2], '2026-10-03', 0)]);
  });

  it('keeps a user-set order (not saved order) and non-UUID ids', () => {
    const list = [e('b-id', '2026-10-02', 1), e('a-id', '2026-10-02', 0), e('한글id', '2026-10-02', 2)];
    expect(decodeBackup(encodeBackup(list))).toEqual([e('a-id', '2026-10-02', 0), e('b-id', '2026-10-02', 1), e('한글id', '2026-10-02', 2)]);
  });

  it('is compact and URL-safe: 30 places fit in well under 800 characters', () => {
    const list = ids.slice(0, 30).map((id, i) => e(id, i < 15 ? '2026-10-01' : '2026-10-02', i % 15));
    const s = encodeBackup(list);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeLessThan(800);
    expect(JSON.stringify(list).length).toBeGreaterThan(s.length * 2);
  });

  it('backupUrl puts the list after # (never in the path or query sent to a server)', () => {
    const url = backupUrl('https://p.example/', [e(ids[0], '2026-10-01', 0)]);
    const u = new URL(url);
    expect(u.pathname).toBe('/');
    expect(u.search).toBe('');
    expect(u.hash.startsWith(BACKUP_HASH)).toBe(true);
    expect(readBackup(u.hash)).toEqual({ found: true, entries: [e(ids[0], '2026-10-01', 0)] });
  });

  it('invalid input: garbage, wrong version, cut short, trailing bytes, bad days, empty → null', () => {
    const good = encodeBackup([e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-01', 1)]);
    expect(decodeBackup('')).toBeNull();
    expect(decodeBackup('!!!')).toBeNull();
    expect(decodeBackup('%%%')).toBeNull();
    expect(decodeBackup(good.slice(0, -4))).toBeNull(); // cut short
    expect(decodeBackup(`${good}AAAA`)).toBeNull(); // trailing bytes
    const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const raw = bytes(good);
    raw[0] = 9; // a version this app does not know
    expect(decodeBackup(b64(raw))).toBeNull();
    expect(decodeBackup(b64(Uint8Array.of(1)))).toBeNull(); // version only, nothing saved
    expect(decodeBackup(b64(Uint8Array.of(1, 0xff, 0xff, 0xff, 0x7f, 1, 0)))).toBeNull(); // day far out of range
    expect(decodeBackup(b64(Uint8Array.of(1, 5, 0)))).toBeNull(); // a day with no places
    expect(decodeBackup(b64(Uint8Array.of(1, 5, 1, 2, 0xff, 0xfe)))).toBeNull(); // not UTF-8
    expect(decodeBackup('A'.repeat(40_000))).toBeNull(); // far too long
  });

  it(`at most ${MAX_SAVED} entries: a link saying more is refused; duplicates on a day collapse to one`, () => {
    const many = Array.from({ length: MAX_SAVED + 1 }, (_, i) => e(`id${i}`, '2026-10-01', i));
    expect(decodeBackup(encodeBackup(many))).toHaveLength(MAX_SAVED);
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeBackup(b64(Uint8Array.of(1, 5, 0xf5, 0x03, 1, 0x61)))).toBeNull(); // "501 places on this day"
    const dup = decodeBackup(encodeBackup([e(ids[0], '2026-10-01', 0), e(ids[0], '2026-10-01', 1)]));
    expect(dup).toEqual([e(ids[0], '2026-10-01', 0)]);
  });

  it('비 와요 (ADR-0065): on, the link carries &r=1 after the list; off (the default) the link is as before', () => {
    const list = [e(ids[0], '2026-10-01', 0)];
    expect(backupUrl('https://p.example/', list)).toBe(backupUrl('https://p.example/', list, false));
    const on = new URL(backupUrl('https://p.example/', list, true));
    expect(on.search).toBe('');
    expect(on.hash.endsWith('&r=1')).toBe(true);
    expect(readBackup(on.hash)).toEqual({ found: true, entries: list, indoor: true });
    expect(readBackup(new URL(backupUrl('https://p.example/', list)).hash)).toEqual({ found: true, entries: list });
    // a flag that is not ours is ignored; the list itself must still read
    expect(readBackup(`${new URL(backupUrl('https://p.example/', list)).hash}&x=1`)).toEqual({ found: true, entries: list });
    expect(readBackup('#s=@@&r=1')).toEqual({ found: true, entries: null });
  });

  it('readBackup: only a #s= fragment is a backup', () => {
    expect(readBackup('')).toEqual({ found: false });
    expect(readBackup('#top')).toEqual({ found: false });
    expect(readBackup('#s=@@')).toEqual({ found: true, entries: null });
  });
});

describe('the day saved (ADR-0085 F5) stays on this device', () => {
  it('a backup link is the same with or without `at`, and reads back without it', () => {
    const plain = [e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-02', 0)];
    const withAt = plain.map((x) => ({ ...x, at: '2026-09-30' }));
    expect(encodeBackup(withAt)).toBe(encodeBackup(plain));
    expect(backupUrl('https://example.test/', withAt)).toBe(backupUrl('https://example.test/', plain));
    expect(decodeBackup(encodeBackup(withAt))).toEqual(plain);
  });

  it('merging a backup keeps the `at` of rows already here; rows brought in have none', () => {
    const here = [{ ...e(ids[0], '2026-10-01', 0), at: '2026-09-29' }];
    const { entries } = mergeEntries(here, [e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-01', 0)]);
    expect(entries).toEqual([{ ...e(ids[0], '2026-10-01', 0), at: '2026-09-29' }, e(ids[1], '2026-10-01', 1)]);
  });
});

describe('merging a backup into this device', () => {
  it('adds what is missing at the end of its day, in the link order; keeps what is here; counts what was added', () => {
    const here = [e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-01', 1)];
    const link = [e(ids[1], '2026-10-01', 0), e(ids[2], '2026-10-01', 1), e(ids[3], '2026-10-02', 0)];
    const { entries, added } = mergeEntries(here, link);
    expect(added).toBe(2);
    expect(entries).toEqual([e(ids[0], '2026-10-01', 0), e(ids[1], '2026-10-01', 1), e(ids[2], '2026-10-01', 2), e(ids[3], '2026-10-02', 0)]);
    expect(mergeEntries(entries, link)).toEqual({ entries, added: 0, left: 0 });
  });

  // 출시 전 점검 F2 (idempotency-security.md K1): normalizeEntries keeps the latest MAX_SAVED, so a later-dated link
  // used to push this device's own saves out without a word
  it('F2 (K1) never past MAX_SAVED by pushing out what is here: the link\'s latest days go in, `left` counts the rest', () => {
    const many = Array.from({ length: 700 }, (_, i) => `p${i}`);
    const mine = many.slice(0, 3).map((id, i) => e(id, '2026-10-15', i));
    const link = many.slice(10, 10 + MAX_SAVED).map((id, i) => e(id, '2026-10-16', i));
    const m = mergeEntries(mine, link);
    expect(m.entries).toHaveLength(MAX_SAVED);
    expect(m.entries.slice(0, 3)).toEqual(mine);
    expect([m.added, m.left]).toEqual([MAX_SAVED - 3, 3]);
    // the link's latest days first: a day gone by is what stays out
    const old = [e(many[600], '2026-09-01', 0), e(many[601], '2026-12-25', 0), e(many[602], '2026-12-25', 1)];
    const two = mergeEntries(many.slice(0, MAX_SAVED - 2).map((id, i) => e(id, '2026-10-15', i)), old);
    expect([two.added, two.left]).toEqual([2, 1]);
    expect(two.entries.filter((x) => x.date === '2026-12-25').map((x) => x.id)).toEqual([many[601], many[602]]);
    expect(two.entries.some((x) => x.date === '2026-09-01')).toBe(false);
    // full already: nothing goes in, nothing goes out
    const full = many.slice(0, MAX_SAVED).map((id, i) => e(id, '2026-10-15', i));
    expect(mergeEntries(full, link.slice(0, 2))).toEqual({ entries: full, added: 0, left: 2 });
  });
});

describe('in-app browsers (ADR-0063 2b)', () => {
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const AND = 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36';
  const cases: [string, string, ReturnType<typeof inAppOf>][] = [
    ['KakaoTalk iOS', `${IOS} KAKAOTALK 10.8.5`, 'kakaotalk'],
    ['KakaoTalk Android', `${AND} KAKAOTALK/10.8.5 (INAPP)`, 'kakaotalk'],
    ['Instagram iOS', `${IOS} Instagram 345.0.0.31.94 (iPhone15,2; iOS 17_5; ko_KR; ko; scale=3.00; 1179x2556; 634108168)`, 'instagram'],
    ['Instagram Android', `${AND} Instagram 345.0.0.48.95 Android (34/14; 450dpi; 1080x2340; samsung; SM-S921N)`, 'instagram'],
    ['Facebook iOS', `${IOS} [FBAN/FBIOS;FBAV/480.0.0.39.94;FBBV/646451530;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBCR/;FBID/phone;FBLC/ko_KR;FBOP/80]`, 'facebook'],
    ['Facebook Android', `${AND} [FB_IAB/FB4A;FBAV/480.0.0.47.109;]`, 'facebook'],
    ['Naver iOS', `${IOS} NAVER(inapp; search; 2000; 12.8.2; 15PRO)`, 'naver'],
    ['Naver Android', `${AND} NAVER(inapp; search; 1300; 12.8.2)`, 'naver'],
    ['LINE iOS', `${IOS} Safari Line/14.15.1`, 'line'],
    ['LINE Android', `${AND} Line/14.15.1/IAB`, 'line'],
    ['Daum iOS', `${IOS} DaumApps/8.6.2 DaumDevice/mobile`, 'daum'],
    ['Safari', `${IOS.replace('Mobile/15E148', 'Version/17.5 Mobile/15E148 Safari/604.1')}`, null],
    ['Chrome Android', 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', null],
    ['Samsung Internet', 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36', null],
    ['Chrome iOS', `${IOS.replace('Mobile/15E148', 'CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1')}`, null],
    ['desktop "Online" in a UA', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OnlineBrowser/1.0', null],
    ['empty', '', null],
  ];
  it.each(cases)('%s', (_, ua, want) => {
    expect(inAppOf(ua)).toBe(want);
  });

  it('KakaoTalk opens the page in the phone browser through its own scheme', () => {
    expect(kakaoExternal('https://p.example/#s=AQ')).toBe('kakaotalk://web/openExternal?url=https%3A%2F%2Fp.example%2F%23s%3DAQ');
  });
});

describe('home-screen nudge kind (ADR-0063 2d)', () => {
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  it('iOS (iPad as Mac with touch): the share-sheet way; elsewhere only when the browser offers its prompt; never when installed or in-app', () => {
    expect(installHow({ ua: IOS, touch: 5, standalone: false, prompt: false })).toBe('ios');
    expect(installHow({ ua: IPAD, touch: 5, standalone: false, prompt: false })).toBe('ios');
    expect(installHow({ ua: IPAD, touch: 0, standalone: false, prompt: false })).toBeNull();
    expect(installHow({ ua: 'Android Chrome', touch: 5, standalone: false, prompt: true })).toBe('prompt');
    expect(installHow({ ua: 'Android Chrome', touch: 5, standalone: false, prompt: false })).toBeNull();
    expect(installHow({ ua: IOS, touch: 5, standalone: true, prompt: false })).toBeNull();
    expect(installHow({ ua: `${IOS} KAKAOTALK 10.8.5`, touch: 5, standalone: false, prompt: false })).toBeNull();
  });
});
