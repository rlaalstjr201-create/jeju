#!/usr/bin/env node
// 시뮬레이터(하위 작업)가 쓰는 화면 조작 도구. 한 묶음 파일 = 여러 세션(서로 다른 사람).
//   node step.mjs brief  <call.json>            사람·상황 소개(처음 한 번)
//   node step.mjs show   <call.json>            안 끝난 세션의 지금 화면
//   node step.mjs act    <call.json> "s1=mood:walk; s3=go:2"   누르기(세션마다 하나씩) → 바뀐 화면을 보여 줌
//   node step.mjs check  <call.json>            모두 끝났나, 사후 답(<call>.notes.jsonl)이 다 있나
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [cmd, file, arg] = process.argv.slice(2);
if (!cmd || !file) { console.error('사용법: node step.mjs brief|show|act|check <call.json> ["s1=코드; s2=코드"]'); process.exit(2); }
const call = JSON.parse(readFileSync(file, 'utf8'));
// 1단계부터 흐름 엔진(flow.mjs). engine 칸이 없으면 0단계 엔진
// engine 'tile'은 기분 타일 첫 탭 시험(docs/research/mood-tile-test-01)
const TILE = call.engine === 'tile';
const { act, attachRand, render } = await import(TILE ? '../../mood-tile-test-01/lab/tile.mjs' : call.engine === 'flow' ? './flow.mjs' : './screen.mjs');
// 팔 코드 → 엔진 팔 이름(묶음 폴더 옆 key.json). 상태 파일엔 코드로만 남긴다.
const KEY = JSON.parse(readFileSync(resolve(dirname(file), '..', 'key.json'), 'utf8'));
call.sessions.forEach((s, i) => { s.key = `s${i + 1}`; s.code = s.state.arm; s.state.arm = KEY[s.code] ?? s.code; attachRand(s.state); });
const en = call.lang === 'en';
const save = () => { for (const s of call.sessions) s.state.arm = s.code; writeFileSync(file, JSON.stringify(call, (k, v) => (k === 'key' || k === 'code' ? undefined : v), 1)); for (const s of call.sessions) s.state.arm = KEY[s.code] ?? s.code; };

const ENDED = { go: en ? 'ended: route opened' : '끝: 길찾기 열림', quit: en ? 'ended: closed the app' : '끝: 앱 닫음', cap: en ? 'ended: too many taps' : '끝: 너무 오래 걸려 그만둠', stuck: en ? 'ended: stuck' : '끝: 막힘', pick: '끝: 골랐음' };
const screenOf = (s) => (s.state.end ? `### ${s.key} — ${ENDED[s.state.end]}` : `### ${s.key} (${s.state.taps}${en ? ' taps' : '번 누름'})\n${render(s.state)}`);

if (cmd === 'brief') {
  // 0c부터: 지시문·사람·첫 화면을 한 번에 — 하위 작업의 왕복을 줄인다(토큰 대부분이 왕복마다 다시 읽는 고정 맥락)
  const here = dirname(fileURLToPath(import.meta.url));
  console.log(readFileSync(TILE ? resolve(here, '../../mood-tile-test-01/lab/agent-tile-ko.md') : resolve(here, '..', 'prompts', `agent-${call.engine === 'flow' ? 'flow-' : ''}${en ? 'en' : 'ko'}.md`), 'utf8'), '\n---\n');
  for (const s of call.sessions) {
    const p = call.persons[s.pid];
    const attrs = Object.entries(p.attrs).map(([k, v]) => `${k} ${v}`).join(' · ');
    console.log(`## ${s.key} — ${p.name}\n${attrs}${call.narrative ? `\n${p.narrative}` : ''}\n${en ? 'Situation' : '상황'}: ${s.situation}\n`);
  }
  console.log(`---\n${en ? 'First screens' : '첫 화면'}\n`);
  console.log(call.sessions.filter((s) => !s.state.end).map(screenOf).join('\n\n'));
  save();
} else if (cmd === 'show') {
  const open = call.sessions.filter((s) => !s.state.end);
  console.log(open.length ? open.map(screenOf).join('\n\n') : en ? 'All sessions ended.' : '모든 세션이 끝났다.');
  save();
} else if (cmd === 'act') {
  const touched = [];
  for (const part of String(arg ?? '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const m = part.match(/^(s\d+)\s*=\s*(\S+)$/);
    const s = m && call.sessions.find((x) => x.key === m[1]);
    if (!s) { console.log(`?? ${part} — ${en ? 'unknown session or format (use s1=code)' : '모르는 세션이거나 형식이 틀림(s1=코드)'}`); continue; }
    if (s.state.end) { console.log(`${s.key}: ${en ? 'already ended' : '이미 끝남'}`); continue; }
    const before = s.state.bad;
    act(s.state, m[2]);
    if (s.state.bad > before) console.log(`${s.key}: ${en ? `no such button "${m[2]}" on this screen` : `이 화면에 「${m[2]}」 버튼이 없다`}`);
    if (!touched.includes(s)) touched.push(s);
  }
  save();
  console.log(touched.map(screenOf).join('\n\n'));
  const left = call.sessions.filter((s) => !s.state.end).length;
  console.log(`\n(${en ? 'sessions still open' : '안 끝난 세션'}: ${left})`);
} else if (cmd === 'check') {
  const left = call.sessions.filter((s) => !s.state.end).map((s) => s.key);
  const nf = `${file.replace(/\.json$/, '')}.notes.jsonl`;
  const notes = existsSync(nf) ? readFileSync(nf, 'utf8').trim().split('\n').filter(Boolean) : [];
  const bad = [], seen = new Set();
  for (const l of notes) {
    try { const n = JSON.parse(l); if (!call.sessions.some((s) => s.key === n.s)) bad.push(`모르는 세션 ${n.s}`); else seen.add(n.s); for (const f of ['stuck', 'recheck', 'burden', 'why']) if (typeof n[f] !== 'string') bad.push(`${n.s}.${f}`); if (!(n.again >= 1 && n.again <= 5)) bad.push(`${n.s}.again`); } catch { bad.push(`JSON 아님: ${l.slice(0, 40)}`); }
  }
  const missing = call.sessions.map((s) => s.key).filter((k) => !seen.has(k));
  if (!left.length && !missing.length && !bad.length) console.log(`OK — ${call.sessions.length}세션 끝, 사후 답 ${notes.length}줄`);
  else console.log(`아직: 안 끝난 세션 [${left.join(',')}] · 사후 답 없음 [${missing.join(',')}] · 오류 [${bad.join('; ')}]`);
} else { console.error(`모르는 명령 ${cmd}`); process.exit(2); }
