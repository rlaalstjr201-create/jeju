// node --test flow.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { SPOTS, act, judge, newSession, render, heartCount } from './flow.mjs';

const next = { day: 1, hour: 9, dateLabel: 'd2', situation: '다음 날 아침' };
const N = (arm) => newSession({ sid: `n-${arm}`, seed: 'n', arm, scenario: 'N', area: '애월', day: 0, hour: 22, dateLabel: 'd1', where: 'gps', saved: [], next });
const four = () => SPOTS.filter((s) => s.mood === 'walk').slice(0, 4).map((s) => ({ id: s.id, day: 0 }));
const P = (arm) => newSession({ sid: `p-${arm}`, seed: 'p', arm, scenario: 'P', area: '애월', day: 0, hour: 20, dateLabel: 'd1', where: 'gps', saved: four().map((x) => ({ ...x, day: arm === 'A' || arm === 'A2' ? 0 : null })) });
const run = (st, codes) => { for (const c of codes) act(st, c); return st; };

test('N: 밤에 「지금」으로 담으면 A만 다음 날 ♥ 0 + 접힘, 나머지는 바로 보임', () => {
  const live = {};
  for (const arm of ['A', 'A2', 'B', 'C']) {
    const st = run(N(arm), ['mood:walk', 'heart:1', 'quit']);
    assert.equal(st.part, 2, arm);
    assert.match(render(st), /다음 날 아침/);
    live[arm] = heartCount(st);
    run(st, ['open_saved', 'go:1']);
    assert.equal(judge(st), arm !== 'A', arm); // A: 첫 줄이 없어 go:1은 없는 버튼
  }
  assert.deepEqual(live, { A: 0, A2: 1, B: 1, C: 1 });
  const a = run(N('A'), ['mood:walk', 'heart:1', 'quit', 'open_saved', 'past_toggle', 'go:1']);
  assert.equal(judge(a), true);
});

test('N: A에서 「내일」로 바꾸고 담으면 다음 날 오늘 묶음에 보인다', () => {
  const st = run(N('A'), ['open_basis', 'when:tomorrow', 'close', 'mood:walk', 'heart:2', 'quit']);
  assert.equal(heartCount(st), 1);
  assert.equal(judge(run(st, ['open_saved', 'go:1'])), true);
});

test('N: 장면 1에서 지도를 열면 위치만 보고 돌아오고, 앱 닫기로 장면 2, 장면 2 길찾기가 끝', () => {
  const st = run(N('B'), ['mood:walk', 'heart:1', 'go:2']);
  assert.equal(st.part, 1);
  assert.match(render(st), /돌아왔다/);
  run(st, ['quit']);
  assert.equal(st.part, 2);
  assert.equal(st.end, null);
  assert.equal(st.parts[0].end, 'quit');
  run(st, ['open_saved', 'go:1']);
  assert.equal(st.end, 'go');
});

test('P: 내일·모레로 나누면 성공, C는 정리 버튼이 없다', () => {
  for (const arm of ['A', 'A2', 'B']) {
    const st = run(P(arm), ['open_saved', 'move:1', 'day:tomorrow', 'move:2', 'day:date', 'cal:2', 'quit']);
    assert.equal(judge(st), true, arm);
  }
  const c = P('C');
  run(c, ['open_saved']);
  assert.doesNotMatch(render(c), /\(move:/);
  assert.equal(judge(run(c, ['move:1', 'quit'])), false);
});

test('기준 시트 「언제」는 A·A2에만', () => {
  for (const arm of ['A', 'A2', 'B', 'C']) {
    const st = run(N(arm), ['open_basis']);
    assert.equal(/\(when:now\)/.test(render(st)), arm === 'A' || arm === 'A2', arm);
  }
});
