# Phase 0 — Hidden Gem Discovery Pipeline 운영 가이드

## 사전 작업 (최초 1회)

### 1. Migration 적용
```bash
npm run migrate
# 013: Phase 0 파이프라인 스키마
# 014: review_excluded 컬럼 + visitjeju 일괄 제외 (ADR-0032)
```

### 2. Naver 쿼리 목록 작성
`src/config/naver-queries.json`에 제주 숨은 명소 발굴용 검색 쿼리를 추가합니다.

```json
[
  "제주 현지인 맛집",
  "제주 숨은 카페",
  "제주 오름 추천",
  "제주 동쪽 숨은 명소",
  "서귀포 현지인 추천"
]
```

> **가이드**: 관광지 이름이 아닌 탐색성 쿼리로 작성하세요. 검색 결과가 많은 유명 관광지보다
> 블로그·카페에서 현지인이 언급하는 장소를 잡아낼 수 있는 키워드를 선호합니다.
> ADR-0029 참조.

### 3. Label Studio 기동 및 큐레이션 프로젝트 설정

```bash
# Docker 기동 (ADR-0027)
docker run -d \
  -p 8080:8080 \
  -v $(pwd)/.labelstudio:/label-studio/data \
  -e LABEL_STUDIO_SECRET_KEY=your-secret \
  heartexlabs/label-studio:latest
```

**Label Studio 설정 체크리스트** (http://localhost:8080):

- [ ] 계정 생성 후 로그인
- [ ] 새 프로젝트 생성: "Jeju Hidden Gem Curation v1"
- [ ] Labeling Interface → Custom template 붙여넣기:
  ```xml
  <View>
    <Header value="$name ($region · $category)" />
    <Text name="snippet" value="$naver_snippet" />
    <Text name="source_url" value="URL: $naver_source_url_text" />
    <Text name="scores" value="authenticity=$authenticity_score  ordinariness=$ordinariness_score  status=$status" />
    <Choices name="decision" toName="snippet" choice="single" showInline="true">
      <Choice value="approve" />
      <Choice value="reject" />
      <Choice value="hold" />
    </Choices>
    <Choices name="rejection_reason" toName="snippet" choice="single" showInline="true" visibleWhen="choice-selected" whenTagName="decision" whenChoiceValue="reject">
      <Choice value="ad" />
      <Choice value="ordinary" />
      <Choice value="low_quality" />
      <Choice value="duplicate" />
      <Choice value="other" />
    </Choices>
    <TextArea name="free_memo" toName="snippet" placeholder="메모 (선택)" rows="2" />
  </View>
  ```
- [ ] Settings → Webhooks → Add Webhook:
  - URL: `http://localhost:3000/api/v1/admin/labeling/webhook`
  - Secret: `.env`의 `LABEL_STUDIO_WEBHOOK_SECRET` 값
  - Events: Annotation created / updated
- [ ] 큐레이터 검토 큐 내보내기 및 import:
  ```bash
  npm run export:curator-queue
  # → dist/curator-queue-<timestamp>.json 생성
  ```
  Label Studio → Import → 생성된 JSON 파일 업로드

---

## 일상 운영 흐름

```
1. 파이프라인 실행
   └─ POST /api/v1/admin/curation/pipeline/run   (또는 npm run seed:visitjeju / seed:naver-discover)

2. Label Studio 검토
   └─ 큐레이터가 각 Candidate를 approve / reject / hold
   ※ 이벤트성 spot은 reject하지 말고 free_memo에 '이벤트:YYYY-MM-DD~YYYY-MM-DD' 형식으로 기간 기입 후 approve. 향후 DB 컬럼 추출 예정.

3. Webhook 수신 → PersistCurationDecisionUseCase 자동 처리
   └─ approve → ApproveCandidateUseCase → spots 테이블 등록

4. 임베딩 배치
   └─ npm run embed:batch
   └─ 특정 spot만: npm run embed:batch -- --spot-ids=id1,id2,id3
```

---

## 스크립트 레퍼런스

| 명령 | 설명 |
|---|---|
| `npm run seed:visitjeju` | Stage 1(visitjeju) 전용 실행 (Naver 건너뜀) |
| `npm run seed:naver-discover` | Stage 1 + Stage 2-5 전체 실행 |
| `npm run migrate` | 미적용 마이그레이션 일괄 실행 (idempotent) |
| `npm run export:curator-queue` | 큐레이터 검토 큐 JSON 내보내기 → `dist/curator-queue-*.json` |
| `npm run embed:batch` | 임베딩 미생성 전체 Spot 처리 |
| `npm run embed:batch -- --spot-ids=id1,id2` | 특정 Spot만 임베딩 |

---

## 모니터링 쿼리

### 검토 대기 Candidate 수
```sql
SELECT status, COUNT(*) AS cnt
FROM curation_candidates
GROUP BY status
ORDER BY cnt DESC;
```

### 거절 사유 분포
```sql
SELECT rejection_reason_enum, COUNT(*) AS cnt
FROM curation_decisions
WHERE decision = 'reject'
GROUP BY rejection_reason_enum
ORDER BY cnt DESC;
```

### 최근 7일 거절 Candidate 상세
```sql
SELECT
  cc.name,
  cc.source_type,
  cd.rejection_reason_enum,
  cd.rejection_reason_text,
  cd.decided_by,
  cd.decided_at
FROM curation_decisions cd
JOIN curation_candidates cc ON cc.id = cd.candidate_id
WHERE cd.decision = 'reject'
  AND cd.decided_at > now() - INTERVAL '7 days'
ORDER BY cd.decided_at DESC
LIMIT 50;
```

### 임베딩 생성 현황
```sql
SELECT
  COUNT(*) FILTER (WHERE embedding IS NULL) AS without_embedding,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS with_embedding,
  COUNT(*) AS total
FROM spots
WHERE is_active = true;
```

### Candidate → Spot 전환률
```sql
SELECT
  ROUND(
    COUNT(*) FILTER (WHERE status = 'approved')::numeric /
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS approval_rate_pct,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending
FROM curation_candidates;
```
