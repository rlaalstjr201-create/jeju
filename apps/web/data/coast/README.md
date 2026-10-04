# 제주 해안선 (노을 볼 곳 계산 입력, ADR-0083)

`jeju-coast.geojson`: 빌드 때 `scripts/sunset.mjs`가 읽는 고정 입력. 빌드는 받지 않는다.

- 출처: OpenStreetMap `natural=coastline`. © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
- 받은 날: 2026-10-03, Overpass API 0.7.62.11, OSM 기준 시각 `2026-07-24T11:04:51Z`.
- 쿼리(Overpass QL): `[out:json];way["natural"="coastline"](33.10,126.10,33.60,127.00);out geom;`
  - 받은 원본: 112개 way, 22,866점, sha256 `f58d9f14bca9ff91afbbe48943f11d86cebe3d4f4beb66dbad8f61c304bbe5a2`(저장소에는 없음).
- 만든 방법: `node scripts/coast-freeze.mjs <원본.json>` — way를 끝점 노드로 이어 닫힌 고리 57개, 고리마다 Douglas–Peucker 5m, 좌표 소수 5자리. 큰 고리부터(0번 = 본섬).
  - 결과: 10,722점, sha256 `c26335d0d456ea2a5bd0d21e6a4c83b46a108724aa6e45789516f92cf8598385`.
- 추자도는 범위 밖이다(출하 장소 0곳).
