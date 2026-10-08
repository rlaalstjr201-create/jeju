// node --test screen.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { SPOTS, act, attachRand, judge, newSession, render } from './screen.mjs';

const saved3 = () => SPOTS.filter((s) => s.mood === 'walk').slice(0, 3).map((s) => ({ id: s.id, day: 1 }));
const s5 = (arm, seed = 'x') => newSession({ sid: `t-${arm}`, seed, arm, scenario: 'S5', area: '애월', day: 1, dateLabel: 'd', where: 'gps', saved: saved3() });
const s1 = (arm) => newSession({ sid: `t1-${arm}`, seed: 'y', arm, scenario: 'S1', area: '애월', day: 0, dateLabel: 'd', where: 'gps', saved: [] });
const run = (st, codes) => { for (const c of codes) act(st, c); return st; };

test('가장 짧은 꺼내기 길: base 2번, L1·L2·L3 3번', () => {
  assert.deepEqual([judge(run(s5('base'), ['open_saved', 'go:1'])), s5('base').taps], [true, 0]);
  for (const [arm, path] of [['base', ['open_saved', 'go:1']], ['L1', ['scroll', 'open_saved', 'go:1']], ['L2', ['menu', 'menu:3', 'go:1']], ['L3', ['mood:walk', 'saved_link', 'go:1']]]) {
    const st = run(s5(arm), path);
    assert.equal(judge(st), true, arm);
    assert.equal(st.taps, arm === 'base' ? 2 : 3, arm);
  }
});

test('보이지 않는 버튼은 화면에 없고, 누르면 없는 버튼', () => {
  assert.match(render(s5('base')), /\(open_saved\)/);
  for (const arm of ['L1', 'L2', 'L3']) assert.doesNotMatch(render(s5(arm)), /\(open_saved\)/, arm);
  const st = run(s5('L3'), ['open_saved']);
  assert.equal(st.bad, 1);
  assert.equal(st.taps, 0);
  assert.match(render(run(s5('L1'), ['scroll'])), /\(open_saved\)/);
});

test('dup은 base와 같은 화면, neg는 글자만 다르고 버튼 코드는 같다', () => {
  const codes = (t) => [...t.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  const a = run(s5('base', 'z'), ['mood:walk']), b = run(s5('dup', 'z'), ['mood:walk']), c = run(s5('neg', 'z'), ['mood:walk']);
  assert.equal(render(a), render(b));
  assert.notEqual(render(a), render(c));
  assert.deepEqual(codes(render(a)), codes(render(c)));
});

test('S1: 하트는 그때 고른 날짜에 담기고, 밤 「지금」 하트는 다음 날 ♥ 숫자에서 빠진다', () => {
  const st = run(s1('base'), ['mood:walk', 'heart:2']);
  assert.equal(judge(st), true);
  assert.equal(st.saved[0].day, 0);
  const st2 = run(s1('base'), ['open_basis', 'when:tomorrow', 'close', 'mood:walk', 'heart:1']);
  assert.equal(st2.saved[0].day, 1);
});

test('없는 버튼 3번이면 막힘, 15번 누르면 그만둠', () => {
  assert.equal(run(s5('base'), ['zzz', 'zzz', 'zzz']).end, 'stuck');
  const st = s1('base');
  for (let i = 0; i < 20 && !st.end; i++) act(st, i % 2 ? 'back' : 'mood:rest');
  assert.equal(st.end, 'cap');
  assert.equal(judge(st), false);
});

test('파일로 저장했다 다시 읽어도 같은 카드가 이어진다', () => {
  const a = run(s1('base'), ['mood:walk']);
  const b = attachRand(JSON.parse(JSON.stringify(a)));
  act(a, 'more'); act(b, 'more');
  assert.deepEqual(a.cards, b.cards);
  const c = run(s1('base'), ['mood:walk', 'more']);
  assert.deepEqual(a.cards, c.cards);
});

test('S5: 카드에서 바로 간 것은 꺼내기 성공이 아니다', () => {
  assert.equal(judge(run(s5('base'), ['mood:walk', 'go:1'])), false);
});
