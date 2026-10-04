// @vitest-environment jsdom
// 써 본 사람에게 묻는 짧은 설문 (ADR-0081, specs/survey.md F1·F2): when the home's line shows, and what 보내기 sends.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { feedbackBody, parseSurvey, surveyDue } from '../src/survey';
import { $, current, render, reset, settle, tap } from './harness';

const KEY = 'jeju.survey';
const rec = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
const line = () => document.querySelector<HTMLButtonElement>('#home .survey [data-action="survey"]');
/** the card links leave for a map app: jsdom must not try to navigate */
const stay = (e: Event) => {
  if ((e.target as Element).closest?.('a')) e.preventDefault();
};

/** one visit: a fresh mount on the same device storage, the data in */
async function visit(deps: Parameters<typeof render>[0] = {}) {
  render(deps);
  await settle();
}
async function openMap() {
  await tap('[data-mood="rest"]');
  await tap('.card .card-link');
}

beforeEach(() => {
  reset();
  document.addEventListener('click', stay);
});
afterEach(() => document.removeEventListener('click', stay));

describe('F1 홈 한 줄 — 조건', () => {
  it('no map opened: no line; with one opened, not in that visit, then in the next, at the very bottom of the home', async () => {
    await visit();
    expect(line()).toBeNull();
    await openMap();
    expect(rec()).toEqual({ map: true });
    await tap('[data-action="change"]');
    expect($('#home').hidden).toBe(false);
    expect(line()).toBeNull();
    await visit();
    expect(line()?.textContent).toBe('써 보니 어땠어요? 1분 설문');
    expect(line()!.closest('p')!.previousElementSibling?.id).toBe('homeMore');
    expect(rec()).toEqual({ map: true, shown: 1 });
  });

  it('shows in 3 visits, then stops by itself', async () => {
    localStorage.setItem(KEY, JSON.stringify({ map: true }));
    for (let n = 1; n <= 3; n++) {
      await visit();
      expect(line(), `visit ${n}`).not.toBeNull();
    }
    expect(rec().shown).toBe(3);
    await visit();
    expect(line()).toBeNull();
    expect(rec().shown).toBe(3);
  });

  it('home → cards → home again in the same visit counts that visit once', async () => {
    localStorage.setItem(KEY, JSON.stringify({ map: true }));
    await visit();
    expect(rec().shown).toBe(1);
    await tap('[data-mood="rest"]');
    expect($('#home').hidden).toBe(true);
    await tap('[data-action="change"]');
    expect(line()).not.toBeNull();
    await tap('[data-mood="walk"]');
    await tap('[data-action="change"]');
    expect(rec().shown).toBe(1);
  });

  it('Esc keeps the sheet open while words are in a box or an IME is composing; otherwise it closes', async () => {
    localStorage.setItem(KEY, JSON.stringify({ map: true }));
    await visit();
    await tap(line()!);
    const esc = (init: KeyboardEventInit = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, ...init }));
    esc({ isComposing: true });
    expect(current().state().overlay).toBe('feedback');
    ($('#fb-wish') as HTMLTextAreaElement).value = '주차';
    esc();
    expect(current().state().overlay).toBe('feedback');
    ($('#fb-wish') as HTMLTextAreaElement).value = '';
    esc();
    expect(current().state().overlay).toBeNull();
  });

  it('tapped: the sheet opens, the line is gone for good (sent or not)', async () => {
    localStorage.setItem(KEY, JSON.stringify({ map: true }));
    await visit();
    await tap(line()!);
    expect(current().state().overlay).toBe('feedback');
    expect(rec()).toEqual({ map: true, shown: 1, tapped: true });
    await tap('#sheet [data-action="close"].sheet-close');
    await settle();
    expect(current().state().overlay).toBeNull();
    expect(line()).toBeNull();
    await visit();
    expect(line()).toBeNull();
  });

  it('기록 끄기: no line (and the visit is not counted), the 의견 보내기 link stays; switched off in this visit, the line goes', async () => {
    localStorage.setItem(KEY, JSON.stringify({ map: true }));
    localStorage.setItem('jeju.track', 'false');
    await visit({ eventsUrl: '/api/events', beacon: () => true });
    expect(line()).toBeNull();
    expect(rec().shown).toBeUndefined();
    expect($('#savedView .feedback [data-action="feedback"]').textContent).toBe('의견 보내기');

    localStorage.setItem('jeju.track', 'true');
    await visit({ eventsUrl: '/api/events', beacon: () => true });
    expect(line()).not.toBeNull();
    // the saved list's 기록 끄기, then back home
    await tap('#saved');
    await tap('#savedView [data-action="track"]');
    await tap('#savedView [data-action="close-saved"]');
    await settle();
    expect(current().state().tracking).toBe(false);
    expect(line()).toBeNull();
    expect($('#savedView [data-action="feedback"]')).not.toBeNull();
  });

  it('when the line does not show, the home is exactly what it was without the survey', async () => {
    await visit();
    const before = $('#home').innerHTML;
    for (const r of [{ map: true, tapped: true }, { map: true, shown: 3 }, { shown: 1 }, 'junk']) {
      reset();
      localStorage.setItem(KEY, JSON.stringify(r));
      await visit();
      expect($('#home').innerHTML).toBe(before);
    }
  });
});

describe('F2 설문 시트', () => {
  async function openFromSaved(post: (b: string) => void) {
    await visit({ postFeedback: post, appVersion: 'abc1234' });
    await tap('[data-mood="rest"]');
    await tap('#saved');
    await tap('#savedView [data-action="feedback"]');
    expect(current().state().overlay).toBe('feedback');
  }

  it('the three questions, all optional; nothing chosen or written: 보내기 sends nothing and closes', async () => {
    const post = vi.fn();
    await openFromSaved(post);
    expect($('#sheet-title').textContent).toBe('써 보니 어땠어요?');
    expect($('#sheet .note').textContent).toBe('하나만 답해도 돼요. 글은 500자까지, 이름·연락처는 쓰지 마세요.');
    expect([...document.querySelectorAll('#sheet input[name="fb-went"]')].map((i) => i.getAttribute('type'))).toEqual(['radio', 'radio', 'radio']);
    expect(document.querySelectorAll('#sheet input[name="fb-pain"][type="checkbox"]').length).toBe(5);
    for (const t of document.querySelectorAll('#sheet textarea')) expect(t.getAttribute('maxlength')).toBe('500');
    ($('#fb-wish') as HTMLTextAreaElement).value = '   ';
    await tap('#sheet [data-action="feedback-send"]');
    await settle();
    expect(post).not.toHaveBeenCalled();
    expect(current().state().overlay).toBeNull();
  });

  it('answers: one POST of known fields only (no day, place or position), then 고마워요', async () => {
    const post = vi.fn();
    await openFromSaved(post);
    await tap('#sheet input[name="fb-went"][value="not"]');
    await tap('#sheet input[name="fb-pain"][value="far"]');
    await tap('#sheet input[name="fb-pain"][value="slow"]');
    ($('#fb-wish') as HTMLTextAreaElement).value = ' 주차 정보가 있으면 좋겠어요 ';
    await tap('#sheet [data-action="feedback-send"]');
    expect(post).toHaveBeenCalledTimes(1);
    expect(JSON.parse(post.mock.calls[0][0])).toEqual({ went: 'not', pains: ['far', 'slow'], wish: '주차 정보가 있으면 좋겠어요', v: 'abc1234' });
    expect($('#sheet-title').textContent).toBe('고마워요');
    expect($('#sheet .note').textContent).toBe('보내 주신 의견은 다음에 고칠 것을 고를 때 읽어요.');
    expect(document.querySelector('#sheet [data-action="feedback-send"]')).toBeNull(); // nothing more to send
  });

  it('a failing send still says 고마워요', async () => {
    await openFromSaved(() => {
      throw new Error('offline');
    });
    await tap('#sheet input[name="fb-went"][value="yet"]');
    await tap('#sheet [data-action="feedback-send"]');
    expect($('#sheet-title').textContent).toBe('고마워요');
  });
});

describe('survey.ts', () => {
  it('a bad record reads as nothing; due = map, not tapped, under 3 visits', () => {
    expect(parseSurvey('x')).toEqual({});
    expect(parseSurvey({ map: 'yes', shown: -1, tapped: 1 })).toEqual({});
    expect(surveyDue({})).toBe(false);
    expect(surveyDue({ map: true })).toBe(true);
    expect(surveyDue({ map: true, shown: 2 })).toBe(true);
    expect(surveyDue({ map: true, shown: 3 })).toBe(false);
    expect(surveyDue({ map: true, tapped: true })).toBe(false);
  });

  it('the body keeps known choices and trimmed text ≤ 500; empty = null', () => {
    expect(feedbackBody({ went: null, pains: [], pain: ' ', wish: '' }, 'dev')).toBeNull();
    expect(feedbackBody({ went: 'maybe', pains: ['rude'], pain: '', wish: '' }, 'dev')).toBeNull();
    expect(feedbackBody({ went: 'went', pains: [], pain: '', wish: '가'.repeat(600) }, 'dev')).toEqual({ went: 'went', wish: '가'.repeat(500), v: 'dev' });
  });
});
