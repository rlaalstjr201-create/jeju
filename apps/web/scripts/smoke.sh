#!/usr/bin/env bash
# 배포 뒤 명령어 점검 (docs/deploy.md §3). 사용: SITE=https://xxx.pages.dev bash scripts/smoke.sh
set -u
: "${SITE:?SITE=https://... 를 넣어 주세요}"
fail=0
ok()  { echo "OK   $1"; }
bad() { echo "FAIL $1"; fail=1; }
hdr() { curl -sS -m 20 -I "$@"; }
chk() { # 설명, 헤더 출력, 정규식
  if echo "$2" | grep -qiE "$3"; then ok "$1"; else bad "$1"; fi
}
h=$(hdr "$SITE/");             chk "/ 200"            "$h" '^HTTP/[0-9.]+ 200'; chk "/ no-cache" "$h" 'cache-control:.*no-cache'
chk "/sw.js no-cache"          "$(hdr "$SITE/sw.js")" 'cache-control:.*no-cache'
chk "manifest no-cache"        "$(hdr "$SITE/manifest.webmanifest")" 'cache-control:.*no-cache'
js=$(curl -sS -m 20 "$SITE/" | grep -o 'assets/index-[^"]*\.js' | head -1)
[ -n "$js" ] && chk "해시 JS 1년 immutable" "$(hdr "$SITE/$js")" 'max-age=31536000.*immutable' || bad "해시 JS 못 찾음"
chk "spots.json 1년 immutable" "$(hdr "$SITE/spots.json?v=x")" 'max-age=31536000.*immutable'
chk "spots.json br"            "$(hdr -H 'accept-encoding: br' "$SITE/spots.json?v=x")" 'content-encoding: br'
chk "없는 주소 404"            "$(hdr "$SITE/nope/deep")" '^HTTP/[0-9.]+ 404'
chk "/jeju/nope 404"           "$(hdr "$SITE/jeju/nope/")" '^HTTP/[0-9.]+ 404'
chk "/privacy 200"             "$(hdr "$SITE/privacy")" '^HTTP/[0-9.]+ 200'
chk "/jeju/ 200"               "$(hdr "$SITE/jeju/")" '^HTTP/[0-9.]+ 200'
chk "sitemap 200"              "$(hdr "$SITE/sitemap.xml")" '^HTTP/[0-9.]+ 200'
chk "og.png image/png"         "$(hdr "$SITE/og.png")" 'content-type: image/png'
curl -sS -m 20 "$SITE/" | grep -q "og:image\" content=\"$SITE/og.png" && ok "og:image 절대 주소" || bad "og:image 절대 주소"
curl -sS -m 20 "$SITE/" | grep -q 'rel="canonical"' && ok "canonical" || bad "canonical"
curl -sS -m 20 "$SITE/robots.txt" | grep -qi '^Allow: /' && ok "robots Allow" || bad "robots Allow"
curl -sS -m 20 "$SITE/llms.txt" | grep -q '^# 여차나:제주' && ok "llms.txt 이름" || bad "llms.txt 이름"
# 옛 이름 0 (ADR-0077, ADR-0082): 「여행귀」·「여행계획짜기 귀찮아」는 JSON-LD alternateName 안에서만 허용. 줄을 합친 뒤 그 배열만 지우고 찾는다.
old=0
for p in / /llms.txt /privacy /jeju/ /jeju/aewol/ /manifest.webmanifest /nope/deep; do
  curl -sS -m 20 "$SITE$p" | tr '\n' ' ' | sed -E 's/"alternateName"[[:space:]]*:[[:space:]]*\[[^]]*\]//g' \
    | grep -qE 'P의 여행|여행계획짜기 귀찮아|계획귀찮아|여행귀' && { old=1; echo "     옛 이름: $p"; }
done
[ $old = 0 ] && ok "옛 이름 0" || bad "옛 이름 남음"
# 분석 셋이 켜져 배포됐는지 (ADR-0078 2). 확인용 기분 탭 1건이 오늘 기록에 더해진다.
home=$(curl -sS -m 20 "$SITE/")
echo "$home" | grep -q 'G-P8DN26LKBC' && ok "GA4 ID 있음" || bad "GA4 ID 없음"
echo "$home" | grep -qE 'naver-wa=[^" ]+' && ok "네이버 wa 있음" || bad "네이버 wa 없음"
hc=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$SITE/api/events/health")
hb=$(curl -sS -m 20 "$SITE/api/events/health")
[ "$hc" = 200 ] && echo "$hb" | grep -qE '^\{"last24h":[0-9]+\}$' && ok "/api/events/health $hb" || bad "/api/events/health $hc $hb"
# 받는 쪽이 살아 있는지만 본다: 형식이 틀린 묶음은 검증에서 400이 나고 아무것도 쌓이지 않는다
# (진짜 기록을 보내면 운영 집계가 점검 횟수만큼 부푼다)
code=$(curl -sS -m 20 -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' \
  --data '[{"e":"smoke"}]' "$SITE/api/events")
[ "$code" = 400 ] && ok "POST /api/events 살아 있음(검증 400, 쌓지 않음)" || bad "POST /api/events $code"
exit $fail
