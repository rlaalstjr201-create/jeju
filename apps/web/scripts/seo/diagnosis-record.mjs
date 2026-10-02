// 진단 기록의 검증·렌더 — `seo-analyst`가 남기는 data/seo/diagnoses/<run_id>.json의 단일 출처.
// (seoulist scripts/lib/diagnosis-record.mjs를 옮김. 배포 전에는 GSC 노출이 없으므로 정렬 첫 키를 severity로 두었다.)
//
// JSON이 단일 출처이고 마크다운은 렌더 결과다 — 둘을 따로 쓰면 어긋나도 아무도 모른다(seoulist 사고).

export const SCHEMA = 1;

/** 자격 없는 판정 — 논거가 좋아도 개입 목록에 넣지 않는다. keyword gate의 kill도 여기에 든다. */
export const DISQUALIFIED = ['already-top', 'lost-shape', 'shown-far', 'gate:kill'];

export const VERDICTS = ['이행 안 됨', '맞았다', '틀렸다', '채점 불가'];
export const SEVERITIES = ['P0', 'P1', 'P2'];
export const LAYERS = ['크롤', '색인', 'GEO', '공유', '수요', '경쟁', '배분'];

/** 채점될 수 없는 검증 조건의 냄새. */
const VAGUE = /(개선되면|나아지면|좋아지면|늘어나면(?!\s*\d)|많아지면|잘\s*되면|노력한다)/;

const asList = (v) => (Array.isArray(v) ? v : []);
const textOf = (x) => (typeof x === 'string' ? x : `${x?.what ?? ''}${x?.why ? ` — ${x.why}` : ''}`);

/**
 * 정렬 키로 다시 세운 순서. 에이전트가 산문으로 순위를 뒤집으면 여기서 어긋난다.
 * 키: severity(P0 먼저) → 영향 노출 내림차순(배포 전 null = 0) → 검증가능 먼저 → sort_id 사전순.
 */
export function sortOrderOf(interventions) {
  const sev = (x) => { const i = SEVERITIES.indexOf(x.severity); return i < 0 ? 9 : i; };
  return [...interventions].sort((a, b) => {
    if (sev(a) !== sev(b)) return sev(a) - sev(b);
    const ai = a.affected_impressions ?? 0, bi = b.affected_impressions ?? 0;
    if (ai !== bi) return bi - ai;
    const av = a.verifiable === false ? 1 : 0, bv = b.verifiable === false ? 1 : 0;
    if (av !== bv) return av - bv;
    return String(a.sort_id ?? '').localeCompare(String(b.sort_id ?? ''));
  });
}

/** 기록 검증 → {errors, warns}. 던지지 않는다. */
export function validateRecord(rec, { filename, maxInterventions = 5 } = {}) {
  const errors = [], warns = [];
  const E = (m) => errors.push(m), W = (m) => warns.push(m);
  if (!rec || typeof rec !== 'object') return { errors: ['기록이 객체가 아니다'], warns };
  for (const k of ['run_id', 'diagnosed_at', 'phase']) if (!rec[k]) E(`${k} 없음`);
  if (rec.phase && !['pre-deploy', 'post-deploy'].includes(rec.phase)) E(`phase는 pre-deploy|post-deploy — "${rec.phase}"`);
  if (filename && rec.run_id && `${rec.run_id}.json` !== filename)
    E(`run_id(${rec.run_id})와 파일명(${filename})이 다르다 — 「가장 최근 = 파일명 최댓값」 규칙이 깨진다`);
  if (rec.phase === 'post-deploy' && !rec.window) E('post-deploy인데 window 없음 — 어느 창의 GSC를 봤는지 모른다');

  if (rec.graded) {
    const g = asList(rec.grading);
    if (!g.length) E(`graded=${rec.graded} 인데 grading이 비었다`);
    for (const x of g) if (!VERDICTS.includes(x.verdict)) E(`판정 enum 밖: ${JSON.stringify(x.verdict)}`);
  }

  const iv = asList(rec.interventions);
  if (iv.length > maxInterventions) E(`개입 ${iv.length}건 — 상한 ${maxInterventions}건`);
  iv.forEach((x, i) => {
    const n = `개입 ${i + 1}`;
    if (!x.title) E(`${n}: title 없음`);
    if (!x.evidence) E(`${n}: evidence 없음 — 근거 없는 권고는 내지 않는다`);
    if (!x.verify) E(`${n}: verify 없음 — 다음 가동이 채점할 수 없다`);
    else if (VAGUE.test(x.verify)) E(`${n}: verify가 채점 불가한 표현이다 — "${x.verify.slice(0, 40)}…"`);
    for (const k of ['qualifies', 'cause_layer', 'severity', 'sort_id']) if (x[k] === undefined || x[k] === null || x[k] === '') E(`${n}: ${k} 없음`);
    if (x.severity && !SEVERITIES.includes(x.severity)) E(`${n}: severity는 P0|P1|P2`);
    if (x.cause_layer && !LAYERS.includes(x.cause_layer)) E(`${n}: cause_layer는 ${LAYERS.join('|')}`);
    if (!('affected_impressions' in x)) E(`${n}: affected_impressions 없음 — 배포 전이면 null로 적는다`);
    if (rec.phase === 'post-deploy' && x.affected_impressions === null) W(`${n}: post-deploy인데 affected_impressions가 null`);
    const bad = DISQUALIFIED.find((d) => String(x.qualifies || '').includes(d));
    if (bad) E(`${n}: 자격 없는 판정(${bad})이 개입 목록에 있다`);
    // 콘텐츠·랜딩 개입은 keyword gate를 통과한 검색어를 가리켜야 한다(경쟁에서 진 seoulist의 교훈).
    if (['content', 'landing'].includes(x.queue_kind) && !x.keyword) E(`${n}: ${x.queue_kind} 개입인데 keyword 없음 — keywords.json의 target만 올린다`);
    if (!x.check) W(`${n}: check 없음 — verify.mjs가 자동 채점할 감사 id가 없다(사람이 채점해야 한다)`);
  });

  if (iv.length > 1) {
    const want = sortOrderOf(iv).map((x) => x.title);
    const got = iv.map((x) => x.title);
    if (want.join('|') !== got.join('|')) E(`정렬 규칙과 어긋난다. 키로 다시 세우면: ${want.map((t, k) => `${k + 1}.${String(t).slice(0, 18)}`).join(' · ')}`);
  }
  if (!asList(rec.instruments).length) E('instruments 없음 — 무엇을 돌렸는지가 리포트의 근거다');
  return { errors, warns };
}

/** 기록 → 마크다운. 비어 있는 절은 그리지 않는다(억지 항목을 만들 이유를 없앤다). */
export function renderRecord(rec) {
  const L = [];
  const p = (s = '') => L.push(s);
  p('## 지난 진단 채점');
  if (!rec.graded) p('첫 가동 — `data/seo/diagnoses/`에 앞선 기록이 없었다.');
  else {
    p(`\`${rec.graded}\` 기록의 항목별 판정:`);
    p();
    p('| # | 판정 | 근거 |');
    p('|---|---|---|');
    for (const g of asList(rec.grading)) p(`| ${g.rank ?? '-'} | **${g.verdict}** | ${g.why ?? ''} |`);
  }
  p();
  p('## 판정 요약');
  const w = rec.window;
  p(`단계 **${rec.phase}**${w ? ` · 창 ${w.start} ~ ${w.end}` : ' · GSC 창 없음(배포 전)'}`);
  if (asList(rec.instruments).length) {
    p();
    p('| 계기 | 결과 |');
    p('|---|---|');
    const mark = { ok: '✔', fail: '✘', skip: '—', stub: '○ 배포 후' };
    for (const t of rec.instruments) p(`| \`${t.name}\` | ${mark[t.status] ?? t.status} ${t.note ?? ''} |`);
  }
  if (rec.summary) { p(); p(rec.summary); }
  p();
  if (asList(rec.interventions).length) {
    p('## 개입 목록 — 정렬 규칙순');
    for (const x of rec.interventions) {
      p();
      p(`### ${x.rank}. ${x.title}`);
      p([`${x.severity}`, `자격 \`${x.qualifies}\``, `원인 ${x.cause_layer} 층`,
        `영향 노출 ${x.affected_impressions ?? '— (배포 전)'}`, x.keyword ? `검색어 「${x.keyword}」` : null,
        x.check ? `채점 \`${x.check}\`` : null].filter(Boolean).join(' · '));
      p();
      p(`- **근거** ${x.evidence}`);
      if (x.why_now) p(`- **왜 지금** ${x.why_now}`);
      if (x.where) p(`- **어디** ${x.where}`);
      p(`- **검증** ${x.verify}`);
    }
    p();
  }
  const sect = (title, arr) => {
    if (!asList(arr).length) return;
    p(`## ${title}`);
    for (const x of arr) p(`- ${textOf(x)}`);
    p();
  };
  sect('더 봐야 할 것 — 원인이 안 갈렸다', rec.investigate);
  sect('손대지 않기로 한 것', rec.not_touching);
  sect('확인 실패', rec.failed);
  sect('저장소 변경', rec.repo_changes);
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
