// @vitest-environment jsdom
// ADR-0063 2·3·4 in the app: storage.persist at the first save, the in-app browser notice, the backup link
// (copy, open, merge), the home-screen nudge once, attribution and the privacy link.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../src/dates';
import { BACKUP_HASH, backupUrl, decodeBackup } from '../src/keep';
import { MAX_SAVED } from '../src/store';
import { reloadOnUpdate } from '../src/update';
import { $, $$, flush, render, reset, tap } from './harness';
import { realSpots } from './fixtures';
import type { SavedEntry } from '../src/types';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const KAKAO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5';
const INSTA = 'Mozilla/5.0 (Linux; Android 14; SM-S921N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 Instagram 345.0.0.48.95 Android';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const [A, B, C] = realSpots.map((s) => s.id);
const stored = (): SavedEntry[] => JSON.parse(localStorage.getItem('jeju.saved.v2') ?? '[]');
const save = (entries: SavedEntry[]) => localStorage.setItem('jeju.saved.v2', JSON.stringify(entries));
async function until(cond: () => boolean) {
  for (let i = 0; i < 50 && !cond(); i++) await flush();
  expect(cond()).toBe(true);
}
const shown = (sel: string) => !$(sel).closest('[hidden]');
async function cards() {
  await tap('[data-mood="rest"]');
  await until(() => $$('#cards .card:not(.ghost)').length === 3);
}
async function openSaved() {
  await tap('#saved');
  await until(() => $$('#savedView .card:not(.ghost)').length > 0);
}

function hide() {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  delete (document as unknown as Record<string, unknown>).visibilityState;
}

/** A new visit on the first screen (not the history entry the last test left behind). */
function revisit(deps: Parameters<typeof render>[0]) {
  window.history.replaceState(null, '', '/');
  return render(deps);
}

afterEach(() => {
  reset();
  window.history.replaceState(null, '', '/');
});

describe('2a navigator.storage.persist', () => {
  it('asked once, at the first save of a visit; not for an unsave, not before any save', async () => {
    const persist = vi.fn(async () => true);
    render({ persist, userAgent: DESKTOP });
    await cards();
    expect(persist).not.toHaveBeenCalled();
    const hearts = $$('#cards .heart') as HTMLButtonElement[];
    await tap(hearts[0]);
    expect(persist).toHaveBeenCalledTimes(1);
    await tap(hearts[0]); // unsave
    await tap(hearts[1]);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('asked at the first 가 봤어요 too (ADR-0087), not for putting it back; still once a visit', async () => {
    const persist = vi.fn(async () => true);
    render({ persist, userAgent: DESKTOP });
    await cards();
    const visited = $$('#cards .visited') as HTMLButtonElement[];
    await tap(visited[0]);
    expect(persist).toHaveBeenCalledTimes(1);
    await tap(visited[0]); // put back
    await tap('#cards .heart');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('a browser without it, or one that throws, changes nothing', async () => {
    render({ userAgent: DESKTOP, persist: () => Promise.reject(new Error('nope')) });
    await cards();
    await tap('#cards .heart');
    expect(stored()).toHaveLength(1);
  });
});

describe('2b in-app browser notice', () => {
  it('KakaoTalk: one sentence on the first screen; 브라우저로 열기 opens the phone browser with what is saved here', async () => {
    render({ userAgent: KAKAO });
    expect(shown('#homeNote')).toBe(true);
    expect($('#homeNote p').textContent).toBe('카카오톡 안에서 저장한 곳은 카카오톡에만 남아요.');
    const link = () => $<HTMLAnchorElement>('#homeNote a[data-action="inapp-open"]');
    expect(link().textContent).toBe('브라우저로 열기');
    const out = () => new URL(link().getAttribute('href')!).searchParams.get('url')!;
    expect(link().getAttribute('href')!.startsWith('kakaotalk://web/openExternal?url=')).toBe(true);
    expect(out()).toBe(`${location.origin}/`);
    await cards();
    await tap('#cards .heart');
    await tap('.top #saved');
    await tap('#savedView .back');
    expect(out().startsWith(`${location.origin}/${BACKUP_HASH}`)).toBe(true);
    // the day saved stays here (ADR-0085): the link carries the rest
    expect(decodeBackup(out().split(BACKUP_HASH)[1])).toEqual(stored().map(({ id, date, order }) => ({ id, date, order })));
  });

  it('닫기 hides it and it stays closed after a reload', async () => {
    render({ userAgent: KAKAO });
    await tap('#homeNote [data-action="inapp-close"]');
    expect(shown('#homeNote')).toBe(false);
    expect(localStorage.getItem('jeju.inappSeen')).toBe('true');
    render({ userAgent: KAKAO });
    expect(shown('#homeNote')).toBe(false);
  });

  it('elsewhere (Instagram): 브라우저로 열기 copies the address and says where to paste it; a failed copy says the other way', async () => {
    const copy = vi.fn(async (_text: string) => true);
    render({ userAgent: INSTA, copy });
    expect($('#homeNote p').textContent).toBe('인스타그램 안에서 저장한 곳은 인스타그램에만 남아요.');
    await tap('#homeNote [data-action="inapp-copy"]');
    await flush();
    expect(copy).toHaveBeenCalledWith(`${location.origin}/`);
    expect($$('#homeNote p').map((p) => p.textContent)).toEqual(['인스타그램 안에서 저장한 곳은 인스타그램에만 남아요.', '링크를 복사했어요. 휴대폰 브라우저 주소창에 붙여 넣어 주세요.']);
    render({ userAgent: INSTA, copy: async () => false });
    await tap('#homeNote [data-action="inapp-copy"]');
    await flush();
    expect($$('#homeNote p')[1].textContent).toBe('오른쪽 위 메뉴에서 다른 브라우저로 열어 주세요.');
  });

  it('a real browser shows no notice', () => {
    render({ userAgent: IOS });
    expect(shown('#homeNote')).toBe(false);
  });
});

describe('2c backup link', () => {
  it('링크로 백업 copies this app\'s address with the saved list after #; the line says what to do with it; a reopened list starts fresh', async () => {
    const list = [
      { id: A, date: today, order: 0 },
      { id: B, date: today, order: 1 },
    ];
    save(list);
    const copy = vi.fn(async (_text: string) => true);
    render({ userAgent: DESKTOP, copy });
    await openSaved();
    expect($('#backupNote').textContent).toBe('');
    await tap('#savedView [data-action="backup"]');
    await flush();
    const url = copy.mock.calls[0][0];
    expect(url.startsWith(`${location.origin}/${BACKUP_HASH}`)).toBe(true);
    expect(decodeBackup(url.split(BACKUP_HASH)[1])).toEqual(list);
    expect($('#backupNote').textContent).toBe('링크를 복사했어요. 다른 브라우저나 기기에서 열면 여기 저장한 곳을 합칠 수 있어요.');
    await tap('#savedView .back');
    await openSaved();
    expect($('#backupNote').textContent).toBe('');
  });

  it('opening one asks to merge (the fragment leaves the address at once); 합치기 adds what is missing, keeps what is here, drops places the data no longer has', async () => {
    save([{ id: A, date: today, order: 0 }]);
    const link = backupUrl(`${location.origin}/`, [
      { id: B, date: today, order: 0 },
      { id: A, date: today, order: 1 },
      { id: 'f00f00f0-0000-4000-8000-000000000000', date: today, order: 2 }, // gone from the data
      { id: C, date: '2026-12-25', order: 0 },
    ]);
    window.history.replaceState(null, '', link.slice(location.origin.length));
    render({ userAgent: DESKTOP });
    expect(location.hash).toBe('');
    await until(() => $('#homeNote p')?.textContent === '링크에 저장한 곳이 3곳 있어요. 이 기기에 합칠까요?');
    expect($$('#homeNote .tbtn').map((b) => b.textContent)).toEqual(['합치기', '그만두기']);
    await tap('#homeNote [data-action="restore-merge"]');
    expect(stored()).toEqual([
      { id: A, date: today, order: 0 },
      { id: B, date: today, order: 1 },
      { id: C, date: '2026-12-25', order: 0 },
    ]);
    expect($('#homeNote p').textContent).toBe('2곳을 합쳤어요. 맨 위 하트 버튼에 모여요.');
    expect($('#announce').textContent).toBe('2곳을 합쳤어요. 맨 위 하트 버튼에 모여요.');
    expect(shown('#saved')).toBe(true);
    await cards(); // the answer has said its piece
    await tap('#results .change');
    expect(shown('#homeNote')).toBe(false);
  });

  it('그만두기 leaves this device as it was; a link that does not read, or an old version, is dropped quietly', async () => {
    window.history.replaceState(null, '', `/${backupUrl('x', [{ id: A, date: today, order: 0 }])}`);
    render({ userAgent: DESKTOP });
    await until(() => shown('#homeNote'));
    await tap('#homeNote [data-action="restore-cancel"]');
    expect(shown('#homeNote')).toBe(false);
    expect(stored()).toEqual([]);
    for (const bad of ['#s=@@@', '#s=', '#s=CQ']) {
      window.history.replaceState(null, '', `/${bad}`);
      render({ userAgent: DESKTOP });
      await flush();
      expect(location.hash).toBe('');
      expect(shown('#homeNote')).toBe(false);
    }
  });

  it('비 와요 (ADR-0065): on, 링크로 백업 carries it; opening that link starts the session with it on', async () => {
    save([{ id: A, date: today, order: 0 }]);
    sessionStorage.setItem('jeju.indoor', 'true');
    const copy = vi.fn(async (_text: string) => true);
    render({ userAgent: DESKTOP, copy });
    await openSaved();
    await tap('#savedView [data-action="backup"]');
    await flush();
    const url = copy.mock.calls[0][0];
    expect(url.endsWith('&r=1')).toBe(true);
    expect(decodeBackup(url.split(BACKUP_HASH)[1].split('&')[0])).toEqual([{ id: A, date: today, order: 0 }]);
    reset();
    window.history.replaceState(null, '', url.slice(location.origin.length));
    render({ userAgent: DESKTOP });
    expect(location.hash).toBe('');
    await until(() => shown('#homeNote'));
    expect(sessionStorage.getItem('jeju.indoor')).toBe('true');
    await cards();
    expect($$('#cards .card .meta .indoor').length).toBe(3);
  });

  // 출시 전 점검 F2 (idempotency-security.md K1)
  it('F2 (K1) a link that would pass 500: every heart saved here stays; the answer says how many could not go in', async () => {
    const mine = realSpots.slice(0, 3).map((s, order) => ({ id: s.id, date: today, order }));
    save(mine);
    const link = backupUrl(`${location.origin}/`, realSpots.slice(10, 10 + MAX_SAVED).map((s, order) => ({ id: s.id, date: addDays(today, 1), order })));
    window.history.replaceState(null, '', link.slice(location.origin.length));
    render({ userAgent: DESKTOP });
    await until(() => $('#homeNote p')?.textContent === `링크에 저장한 곳이 ${MAX_SAVED}곳 있어요. 이 기기에 합칠까요?`);
    await tap('#homeNote [data-action="restore-merge"]');
    expect(stored()).toHaveLength(MAX_SAVED);
    expect(stored().filter((x) => x.date === today)).toEqual(mine);
    const said = [`${MAX_SAVED - 3}곳을 합쳤어요. 맨 위 하트 버튼에 모여요.`, '저장은 500곳까지라 3곳은 넣지 못했어요.'];
    expect($$('#homeNote p').map((p) => p.textContent)).toEqual(said);
    expect($('#announce').textContent).toBe(said.join(' '));
  });

  // 출시 전 점검 F12 (bugs.md S1): the #s= has left the address, so a reload would take the question with it
  it('F12 (S1) the 합칠까요? question holds a service-worker update reload until it is answered', async () => {
    window.history.replaceState(null, '', `/${backupUrl('x', [{ id: A, date: today, order: 0 }])}`);
    const app = render({ userAgent: DESKTOP });
    await until(() => shown('#homeNote'));
    const reload = vi.fn();
    let take = () => undefined as void;
    reloadOnUpdate({
      sw: { controller: {}, addEventListener: (_t, fn) => void (take = fn) },
      doc: document,
      idle: () => app.state().view === 'home' && !app.state().overlay && app.state().phase.k !== 'pending', // main.ts
      hold: () => app.unsaved(),
      current: async () => false,
      reload,
    });
    expect(app.unsaved()).toBe(true);
    take(); // a deploy's worker takes over while the question is up (the first screen, idle)
    await flush();
    hide();
    expect(reload).not.toHaveBeenCalled();
    expect(shown('#homeNote')).toBe(true);
    await tap('#homeNote [data-action="restore-merge"]');
    expect(app.unsaved()).toBe(false);
    hide();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('pasted into an open tab (only the fragment changes): asked too', async () => {
    render({ userAgent: DESKTOP });
    window.history.replaceState(null, '', `/${backupUrl('x', [{ id: A, date: today, order: 0 }])}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await until(() => shown('#homeNote'));
    expect(location.hash).toBe('');
  });
});

describe('2d home-screen nudge', () => {
  it('iOS: once, the first time the saved list opens after a save; not again in this visit or the next', async () => {
    save([{ id: A, date: today, order: 0 }]);
    render({ userAgent: IOS });
    expect(shown('#nudge')).toBe(false);
    await openSaved();
    expect(shown('#nudge')).toBe(true);
    expect($$('#nudge p').map((p) => p.textContent)).toEqual(['홈 화면에 추가하면 저장한 곳이 오래 남아요.', '공유 버튼에서 ‘홈 화면에 추가’를 눌러 주세요. 지금 저장한 곳은 아래 ‘링크로 백업’으로 옮겨요.']);
    await tap('#nudge [data-action="nudge-close"]');
    expect(shown('#nudge')).toBe(false);
    await tap('#savedView .back');
    await openSaved();
    expect(shown('#nudge')).toBe(false);
    revisit({ userAgent: IOS });
    await openSaved();
    expect(shown('#nudge')).toBe(false);
  });

  it('Android/Chrome: only with the browser\'s install prompt, which 홈 화면에 추가 opens', async () => {
    save([{ id: A, date: today, order: 0 }]);
    render({ userAgent: DESKTOP });
    const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(async () => undefined) });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await openSaved();
    expect($$('#nudge .tbtn').map((b) => b.textContent)).toEqual(['홈 화면에 추가', '닫기']);
    await tap('#nudge [data-action="install"]');
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(shown('#nudge')).toBe(false);
  });

  it('no prompt and not iOS: nothing; in an in-app browser never (its own notice says where to go)', async () => {
    save([{ id: A, date: today, order: 0 }]);
    render({ userAgent: DESKTOP });
    await openSaved();
    expect(shown('#nudge')).toBe(false);
    localStorage.removeItem('jeju.installSeen');
    revisit({ userAgent: KAKAO });
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn() }));
    await openSaved();
    expect(shown('#nudge')).toBe(false);
  });
});

describe('3·4 attribution and privacy', () => {
  it('the results and the saved list say where places and photos come from; the saved list links the privacy page', async () => {
    save([{ id: A, date: today, order: 0 }]);
    render({ userAgent: DESKTOP });
    await cards();
    const credit = '정보·사진: 비짓제주(제주관광공사) · visitjeju.net';
    const site = (where: string) => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>(`${where} .credit a[href*="visitjeju"]`)];
      expect(links, where).toHaveLength(1);
      const [l] = links;
      expect(l.textContent).toBe('visitjeju.net');
      expect(l.getAttribute('href')).toBe('https://www.visitjeju.net');
      expect(l.getAttribute('target')).toBe('_blank');
      expect(l.getAttribute('rel')).toBe('noopener');
    };
    expect($('#results .credit').textContent).toBe(credit);
    site('#results');
    await openSaved();
    expect($('#savedView .credit').textContent).toBe(credit);
    site('#savedView');
    // ADR-0083: the coastline 노을 볼 곳 is worked out from (ODbL)
    const osm = [...document.querySelectorAll<HTMLAnchorElement>('#savedView .credit a[href*="openstreetmap"]')];
    expect(osm).toHaveLength(1);
    expect(osm[0].closest('.credit')!.textContent).toBe('해안선: © OpenStreetMap contributors');
    expect(osm[0].getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    expect(osm[0].getAttribute('target')).toBe('_blank');
    expect(osm[0].getAttribute('rel')).toBe('noopener');
    const a =$<HTMLAnchorElement>('#savedView .about > a');
    expect(a.getAttribute('href')).toBe('/privacy');
    expect(a.textContent).toBe('개인정보 처리 안내');
  });
});
