// 시뮬레이터 입력 묶음 만들기.
//   node sim/build.mjs flows   → work/flow-X.md · flow-Y.md · flow-Z.md (공통 + 그 흐름만)
//   node sim/build.mjs r1      → work/r1-{X,Y,Z}-{0..3}.jsonl (250명씩)
//   node sim/build.mjs r2      → work/r2-{X,Y,Z}-{0..3}.jsonl (replay-r1.jsonl 필요)
// 같은 사람은 세 흐름에서 같은 상황·같은 오늘 줄을 받는다(짝 비교).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newState, renderSaved, heartCount } from './engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = path.join(ROOT, 'work');
const FLOWS = ['X', 'Y', 'Z'];
const BATCH = 250;
const readJsonl = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const h = (str) => { let x = 2166136261; for (const c of str) x = Math.imul(x ^ c.charCodeAt(0), 16777619) >>> 0; return x; };
const choose = (id, salt, arr) => arr[h(id + salt) % arr.length];

function flows() {
  const src = fs.readFileSync(path.join(ROOT, '20-flows.md'), 'utf8');
  const common = src.split('## X')[0].replace('# 시험할 화면 흐름 X · Y · Z', '# 이 앱의 화면').replace('세 흐름은 아래 「공통」이 같고 「다른 점」만 다르다.', '');
  for (const f of FLOWS) {
    const body = src.split(`## ${f}\n`)[1].split(/\n## /)[0];
    fs.writeFileSync(path.join(W, `flow-${f}.md`), `${common.trim()}\n\n## 날짜와 저장 목록\n${body.trim()}\n`);
  }
  console.log('flows written');
}

function personas() {
  const skel = readJsonl(path.join(ROOT, 'personas-skeleton.jsonl'));
  const narr = new Map();
  for (const f of fs.readdirSync(W).filter((n) => /^narr-\d\.jsonl$/.test(n))) for (const r of readJsonl(path.join(W, f))) narr.set(r.id, r);
  return skel.map((p) => {
    const n = narr.get(p.id);
    const { order, scenario1, narrative, ...persona } = p;
    return { p, persona, name: n?.name, narrative: narrative === false ? undefined : n?.narrative };
  });
}

const companionLine = (p, asleep) =>
  p.companion === '혼자' ? '혼자 왔다' : `${{ 가족: '가족', 친구연인: '친구나 연인', 직장동료: '직장 동료' }[p.companion]} ${p.party - 1}명과 같이 왔다${asleep ? ' (다들 자려고 누웠다)' : ''}`;
const deciderLine = (p) => ({ 본인: '보통 내가 정하는 편이다', 같이: '같이 정하는 편이다', 배우자: '배우자가 정하는 편이다', 동행: '동행이 정하는 편이다', '동행(계획형)': '동행이 일정을 짜 왔는데 오늘 오후는 비어 있다', '그때그때 같이': '둘 다 정해 둔 게 없다' }[p.decider] ?? '');
const TODAY = ['없음', '없음', '비 소식 · 실내만 볼까요?', '노을 볼 곳 4곳 · 차로 45분 안', '오늘 세화 장날'];

function situation(p, scenario, round) {
  const d = Math.max(1, Math.min(p.days - 1, 1 + (h(p.id + 'd') % Math.max(1, p.days - 1))));
  if (scenario === 'S1') return `여행 ${d}일째 밤 11시쯤, 숙소 침대에 누워 있다. 내일 뭐 할지는 아직 안 정했다. ${companionLine(p, true)}. 폰으로 이 앱을 연다.`;
  if (scenario === 'S3') return `여행 ${choose(p.id, 's3', [3, 5, 7])}일 전 저녁, 집 소파에 앉아 있다. 제주에는 아직 없다. 이번 여행 생각이 나서 이 앱을 연다. (지금 제주 밖이라 내 위치 근처로는 볼 수 없다.)`;
  if (scenario === 'S4') return `여행 ${d}일째 ${choose(p.id, 't4', ['오후 2시', '점심 먹고 나서', '오전 11시'])}, 동행과 ${choose(p.id, 'p4', ['렌터카 안', '카페 앞', '해변 주차장'])}에 있다. 동행이 「이제 어디 가?」 하고 묻는다. ${deciderLine(p)}. 이 앱을 연다.`;
  if (scenario === 'S2') {
    const day = round === 2 ? `여행 ${Math.min(p.days, d + 1)}일째` : `여행 ${d}일째`;
    return `${day} ${choose(p.id, 't2' + round, ['오전 10시, 숙소에서 나와 차에 탔다', '점심을 먹고 식당 앞에 서 있다', '오후 3시, 카페에서 막 나왔다', '해 지기 한 시간 전, 바닷가 근처다'])}. 다음에 어디 갈지 아직 모른다. ${companionLine(p, false)}. 이 앱을 연다.`;
  }
  return '';
}

function home(st, p, scenario, label) {
  const hc = heartCount(st);
  const hasSaved = st.saved.length > 0;
  const line = choose(p.id, 'today', TODAY);
  return `맨 위: [${label}]${hasSaved ? ` [♥ ${hc}]` : ''} / 오늘 줄: ${line === '없음' ? '(누를 줄 없음)' : line}`;
}

function writeBatches(round, items) {
  for (const f of FLOWS) {
    const rows = items.filter((r) => r.flow === f);
    for (let k = 0; k * BATCH < rows.length; k++) fs.writeFileSync(path.join(W, `r${round}-${f}-${k}.jsonl`), rows.slice(k * BATCH, (k + 1) * BATCH).map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  console.log(`r${round}: ${items.length} items`);
}

function r1() {
  const items = [];
  for (const { p, persona, name, narrative } of personas()) {
    for (const flow of FLOWS) {
      const sc = p.scenario1;
      const st = newState(flow, 0, []);
      items.push({ id: p.id, flow, round: 1, scenario: sc, persona, name, narrative, situation: situation(p, sc, 1), home: home(st, p, sc, sc === 'S3' ? '지역 고르기' : '내 위치 근처'), saved: renderSaved(st) });
    }
  }
  writeBatches(1, items);
}

function r2(cross = false) {
  const rep = new Map(readJsonl(path.join(W, cross ? 'replay-cross-r1.jsonl' : 'replay-r1.jsonl')).map((r) => [`${r.id}|${r.flow}`, r]));
  const only = cross ? new Set(JSON.parse(fs.readFileSync(path.join(W, 'picks.json'), 'utf8')).cross) : null;
  const items = [], meta = [];
  for (const { p, persona, name, narrative } of personas()) {
    if (only && !only.has(p.id)) continue;
    for (const flow of FLOWS) {
      const r = rep.get(`${p.id}|${flow}`);
      const saved = r?.savedAfter ?? [];
      const s5 = saved.length > 0;
      const day = !s5 ? 1 : p.scenario1 === 'S3' ? 3 : 1;
      const st = newState(flow, day, saved);
      const sc = s5 ? 'S5' : 'S2';
      const sit = s5
        ? p.scenario1 === 'S3'
          ? '여행 첫날 아침, 제주에 도착해 렌터카를 받았다. 며칠 전 집에서 이 앱으로 봐 둔 곳이 떠오른다. 이 앱을 연다.'
          : p.scenario1 === 'S1'
            ? '다음 날 아침 9시, 숙소에서 나가기 전이다. 어젯밤 이 앱에서 봐 둔 곳들이 떠오른다. 이 앱을 연다.'
            : '다음 날 아침, 숙소에서 나가기 전이다. 어제 이 앱에서 하트 눌러 둔 곳이 떠오른다. 이 앱을 연다.'
        : situation(p, 'S2', 2);
      items.push({ id: p.id, flow, round: 2, scenario: sc, persona, name, narrative, situation: sit, home: home(st, p, sc, '내 위치 근처'), saved: renderSaved(st) });
      meta.push({ id: p.id, flow, day, saved, scenario: sc, first: p.scenario1 });
    }
  }
  if (cross) {
    for (const f of FLOWS) fs.writeFileSync(path.join(W, `cross-r2-${f}.jsonl`), items.filter((r) => r.flow === f).map((r) => JSON.stringify(r)).join('\n') + '\n');
    fs.writeFileSync(path.join(W, 'cross-r2-meta.jsonl'), meta.map((m) => JSON.stringify(m)).join('\n') + '\n');
    console.log(`cross r2: ${items.length} items`);
    return;
  }
  writeBatches(2, items);
  fs.writeFileSync(path.join(W, 'r2-meta.jsonl'), meta.map((m) => JSON.stringify(m)).join('\n') + '\n'); // 재생용(시뮬레이터에게 주지 않는다)
}

const cmd = process.argv[2];
if (cmd === 'flows') flows();
else if (cmd === 'r1') r1();
else if (cmd === 'r2') r2();
else if (cmd === 'r2cross') r2(true);
else console.error('사용: node sim/build.mjs flows|r1|r2');
