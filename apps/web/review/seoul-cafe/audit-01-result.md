# 감사 01 결과 (2026-11-06, criteria-01 8절)

- 판정 900곳(묶음마다 새 Opus 15): keep 84 · drop 816. 표본 80곳(씨앗 20261108, keep 40·drop 40), 판정을 보지 않은 새 Opus 1회 블라인드(`audit-01-out.json`).
- keep 37/40 = **92.5%** → 통과. drop 40/40 = **100%** → 통과. **둘 다 90% 이상이라 싣는다**(9절).
- 불일치 3곳(모두 판정 keep·감사 drop): 테일러커피 서촌경복궁점(체인 지점의 고유 경험), 벙커컴퍼니 압구정점(D3 공간), ㅎㄷ카페.
- 1회 실행 규칙대로 다시 돌린 단계 없음. 계산: `node scripts/seoul-cafe/curate.mjs result` → `audit-01-result.json`.
