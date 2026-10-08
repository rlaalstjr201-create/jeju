// 기준 보정용 가짜 정책(10-stage0-prereg.md 「기준 보정」): node null-policy.mjs <stage0 복사본> <lab 경로> <반복 표시>
// 가짜 정책: 보이는 버튼 중 그럴듯한 것을 고르는 단순 규칙 + 난수 → 파이프라인·판정 계산 점검용
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const lab = process.argv[3];
const { act, attachRand, render, rng } = await import('file:///' + lab + '/screen.mjs');
const dir = process.argv[2];
const KEY = JSON.parse(readFileSync(resolve(dir, 'key.json'), 'utf8'));
for (const f of readdirSync(resolve(dir, 'calls')).filter((f) => f.endsWith('.json'))) {
  const p = resolve(dir, 'calls', f); const call = JSON.parse(readFileSync(p, 'utf8'));
  const notes = [];
  call.sessions.forEach((s, i) => {
    const code = s.state.arm; s.state.arm = KEY[code]; attachRand(s.state); const r = rng(s.sid + 'pol' + (process.argv[4] ?? ''));
    while (!s.state.end) {
      const codes = [...render(s.state).matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
      const pref = s.scenario === 'S5' ? ['open_saved', 'saved_link', 'go:1', 'scroll', 'menu:3', 'menu'] : ['heart:1', 'go:2', 'mood:walk'];
      let c = pref.find((x) => codes.includes(x) && r() < 0.8) ?? codes[Math.floor(r() * codes.length)];
      act(s.state, c);
    }
    s.state.arm = code;
    notes.push(JSON.stringify({ s: `s${i + 1}`, stuck: '없음', recheck: '없음', burden: '없음', again: 3, why: 'x' }));
  });
  writeFileSync(p, JSON.stringify(call)); writeFileSync(p.replace(/\.json$/, '.notes.jsonl'), notes.join('\n') + '\n');
}
