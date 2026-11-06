// 돌연변이 테스트 (docs/qa/README.md): 코드를 일부러 망가뜨려(돌연변이) 기존 테스트가 잡는지 본다. 범위는 좁게 시작 —
// 서울 둘러보기의 순수 함수들과 state.ts의 「지금 닫힌 곳 빼기」(viewingShut·openSpots) 줄만. 넓히려면 mutate에 더한다.
// Stryker 8.7: 이 저장소의 vitest 1.6과 맞는 마지막 줄(10.x는 vitest 2 이상).
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/seoul/fun.ts', 'src/seoul/weekly.ts', 'src/seoul/browse.ts', 'src/state.ts:460-490'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  // 리포트·작업 폴더는 커밋하지 않는다 (.gitignore)
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // 작업 사본(sandbox)을 저장소 맨 위 .stryker-tmp/에 둔다: 테스트가 '../../../docs/…'처럼 저장소 기준으로 읽는 파일이 그대로
  // 보이고, 의존성은 맨 위 node_modules(작업공간 끌어올림)로 찾는다. node_modules 정션은 만들지 않는다 — 정션째 지우다
  // 본 저장소가 지워진 사고가 있었다.
  tempDirName: '../../.stryker-tmp',
  symlinkNodeModules: false,
  // 기본값은 index.html의 <script>에도 「// @ts-nocheck」를 끼워 넣어 그 스크립트를 읽는 테스트(i18n)가 깨진다: src만
  disableTypeChecks: 'src/**/*.ts',
  // 정적 돌연변이(모듈 맨 위 상수: ORDER·HOURS·SHELVES 등)는 바꿀 때마다 1,772개 테스트를 전부 돌려 4시간 넘게 걸린다
  // (2026-11-05 추정). 꺼 두고 「Ignored」로 센다 — 그 상수들은 측정 밖이다 (docs/qa/mutation-2026-11-05.md).
  ignoreStatic: true,
  concurrency: 4,
  timeoutMS: 20000,
};
