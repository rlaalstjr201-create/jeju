# Grilling Seed — 제주 여행 올인원

> Matt Pocock Grilling 스킬 입력용 미니멀 컨텍스트.
> **의도적으로 도메인 용어·entity·아키텍처는 비워둠.** 그건 인터뷰에서 도출되는 게 목적.

---

## 1. 문제 (Problem)

제주 4–5일 여행을 위해 평균 8개 앱을 사용:
항공 검색 / 숙소 / 렌터카 / 지도·길찾기 / 정보수집(블로그·인스타) / 식당예약 / 체험 / 날씨·결항

→ 인지부하 · 결정피로 · 컨텍스트 단절

---

## 2. 거친 의도 (Rough Intent)

- "제주공항 도착 순간부터 떠날 때까지 앱 하나"
- 자체 인벤토리·결제 X. 외부 임베드 + 자체 가치는 *큐레이션과 컨텍스트 운영*
- 4달 안에 MVP, 본인의 실제 제주 여행에서 알파 테스트

---

## 3. 영감 (Reference, 베끼는 모델)

Uber GO–GET 2026:
- "One app for everything — go, get, travel."
- Expedia·OpenTable·Vrbo·Welcome Pickups 임베드 (자체 구축 X)
- Travel Mode = personal travel concierge
- "We give you your time back."
- Uber One 멤버십 = 락인 메커니즘

우리 차이: 도시 일상이 아니라 **제주 + 4–5일 여행이라는 압축된 컨텍스트**.

---

## 4. 자체 가치 후보 (가설, Grilling이 도전·정제할 것)

- 노출 적은 좋은 장소를 점수화하는 *큐레이션*
- 현재 위치 · 남은 시간 · 취향 기반 *즉흥 추천*
- 자연어 한 줄로 *일정 재구성*
- 가입 시 *사진 스와이프*로 취향 학습

→ 이것들이 진짜 핵심 가치인지, 어떤 게 빠져야 하는지는 Office Hours에서.

---

## 5. 제약 (Constraints)

- 1인 개발 + AI 코딩 에이전트 보조
- 4개월 기한
- 제주 한정 (확장은 v2)
- 직접 결제·인벤토리 X (어필리에이트 only)
- iOS + Android 동시 출시 필요 (React Native 후보)

---

## 6. 사용자 (User)

- 1차: 20–30대 자유여행객, 인스타로 정보 수집, 렌터카 운전
- 2차: 30–40대 가족여행, 효율 중시
- 3차 (v2): 외국인 자유여행객

---

## 7. Grilling이 답해야 할 것 (인터뷰 가이드)

- 핵심 도메인 entity는 무엇인가? (여정? 일정? 장소? 체험? 세션?)
- entity 간 관계와 invariant는?
- bounded context의 경계는 어디인가? (예: 예약 vs 추천 vs 컨시어지)
- ubiquitous language는 한국어인가 영어인가, 혼용 정책은?
- 시간 · 위치 · 상태(여행 전/중/후)는 어떤 1급 개념으로 표현?
- 외부 파트너 API (아고다·쏘카·마이리얼트립·카카오맵·기상청)는 어떻게 안티-커럽션 레이어로 격리?
- 사용자 취향(taste)은 entity인가 value object인가, 어디 소속인가?
- "Hidden Gem", "Now Mode", "Concierge" 같은 마케팅 용어가 도메인 모델에서도 살아남는가, 아니면 다른 용어로 치환되는가?

---

## 8. Out-of-scope for Grilling (다른 단계에서 다룸)

- UI 와이어프레임 → 별도 디자인 단계
- 구체적 기술 스택 결정 → Light Spec 단계
- 마케팅 카피 · 가격 정책 → Office Hours
- 인프라 · 배포 → Plan 단계

---

*입력 후 인터뷰 결과는 `context.md`로 저장하고 모든 후속 단계의 사전으로 활용.*
