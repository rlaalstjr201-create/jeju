# 일본어권 여행 앱·가이드북 표현 조사 (여차나:제주 일본어판 준비)

조사일: 2026-10-17. WebSearch 30회(상한) + WebFetch. 출처마다 URL을 붙였고, 직접 확인하지 못한 것은 「확인 실패」로 적었다.
「추론」이라고 적은 항목은 출처 없이 조사자가 판단한 것이니 원어민 검수 전에는 확정으로 쓰지 않는다.

## 0. 조사 범위와 확인 실패

- **코네스트(konest.com)**: 상세 페이지 WebFetch가 HTTP 406으로 막혔고, 검색 결과에도 코네스트 페이지가 한 번도 나오지 않았다 → 코네스트 표기 전부 **확인 실패**.
  (https://www.konest.com/contents/spot_mise_detail.html?id=1880, https://www.konest.com/contents/area_main.html?id=36)
- **한국관광공사 일본어판(japanese.visitkorea.or.kr)**: 첫 화면만 읽었다. 장소 상세 페이지는 HTTP 400이었고 `site:` 검색에도 걸리지 않았다 → 장소명 공식 표기는 **확인 실패**.
  대신 K-TRIP TIPS(ktriptips.com/jpn)를 참고했다. 이 사이트는 공사 TourAPI 일본어 데이터와 형식이 같아 보이지만, 페이지에 출처 표기가 없어서 "공사 데이터"라고 단정하지는 못한다.
- **地球の歩き方 본서**: 내용은 확인 못 했다(**확인 실패**). 웹매거진 기사 1편과, 2026-05 발행 aruco 『チェジュ島』의 판매 페이지 목차만 확인했다.
- **じゃらん・楽天トラベル・NAVITIME・Klook/KKday・トリップアドバイザー・ことりっぷ・るるぶ**: 버튼 문구를 1차 자료로 확인하지 못했다(**확인 실패**). るるぶ는 검색 결과에 URL만 나왔다(https://rurubu.jp/andmore/article/25278).

## 1. 앱 마이크로카피의 톤

**결론: 메뉴와 버튼은 명사·동사 원형으로 짧게, 설명문은 です・ます. 「気分」 프롬프트는 「〜したい」형이 실제로 쓰인다.**

- 한국관광공사 일본어판: 내비게이션은 「旅行の準備」「エリアガイド」 같은 명사형이다. 버튼은 「検索」「もっと見る」「閉じる」. 설명문은 「ログイン後にプランを作成できます。」처럼 です・ます체. (https://japanese.visitkorea.or.kr/)
- Google 지도 일본어 도움말: 저장 버튼은 「保存」, 목록은 「保存済み」, 안내문은 「[保存] をクリックします。」처럼 です・ます체. (https://support.google.com/maps/answer/3184808?hl=ja)
  길찾기 버튼은 「経路」다. 「下部の「経路」をタップ」라는 설명이 검색 발췌에 나왔지만, 다음 기사들 가운데 어느 것인지는 특정하지 못했다. (https://www.luft.co.jp/media/how-to-use-google-maps/, https://www.lifehacker.jp/article/170402_google_map_settings1/)
  기본 목록 이름은 출처마다 다르다. 검색 발췌에는 「お気に入り」「行きたい場所」「スター付きの場所」로 나왔고, 「行ってみたい」라고 쓴 기사도 있다. 현재 앱 화면으로는 확인하지 못했다. (https://macfan.book.mynavi.jp/article/108430/, https://appllio.com/google-maps-list-feature)
- Retty: 「行きたい」로 가게를 저장하고 「行った」로 방문을 기록하는 구조. (https://app-liv.jp/maps/all/1661/, https://minhyo.jp/retty?page=3)
  食べログ도 「行きたい」 체크를 쓴다는 사용자 리뷰가 있다. 다만 공식 버튼명은 확인하지 못했다. 앱 이름 부제는 「「おいしいお店」が見つかるグルメアプリ」다. (https://apps.apple.com/jp/app/id763377066)
- 기분형 프롬프트: 昭文社의 외출 앱 「週末どこ行く?」가 힌트 단어로 「おまかせ」「のんびり過ごしたい」를 보여 줬다(2015년 기사, 현재 서비스 여부는 확인 실패). (https://www.travelvoice.jp/20150728-47357)
  근처 장소를 제안하는 앱 「ここより」의 스토어 설명에는 「「次どうしよう」と思ったら」라는 문구가 있다. (https://apps.apple.com/us/app/id1619728475)
- VisitJeju 일본어판: 메뉴는 「観光施設」「グルメ・カフェ」「買い物・お土産」 같은 명사형. (https://www.visitjeju.net/jp)

여차나에 적용하면 이렇다(추론). 기분 버튼은 반말 「〜したい」형(「のんびりしたい」)이 일본 앱 관행과 맞고, 한국어판의 반말 톤도 그대로 살릴 수 있다. 기능 버튼(保存·経路·もっと見る)은 Google 지도·공사가 쓰는 명사·동사 원형을 따른다. 안내문과 에러 문구만 です・ます로 쓴다.

## 2. 제주 지명·용어의 일본어 표기

**결론: 한자 표기에 가타카나 독음을 괄호로 붙이는 「漢字（カナ）」 방식이 거의 모든 출처에서 공통이다. 지명 대부분은 표기가 일치하고, 갈리는 것은 한라산 독음, 협재의 한자, 곶자왈의 가타카나 정도다.**

- **城山日出峰（ソンサンイルチュルボン）**: K-TRIP TIPS, 地球の歩き方 웹매거진, aruco 목차가 모두 같다. (https://www.ktriptips.com/jpn/tourspot/229847, https://www.arukikata.co.jp/webmagazine/273709/, https://www.maruzenjunkudo.co.jp/products/9784058026359)
- **漢拏山**: 독음이 갈린다. 地球の歩き方 웹매거진과 近畿日本ツーリスト 계열 기사는 「ハルラサン」. funliday는 제목에서 「ハンラサン」을 쓰고 본문에서는 「ハルラサン」도 쓴다. (https://www.arukikata.co.jp/webmagazine/273709/, https://www.nta.co.jp/media/tripa/articles/VpZrP, https://www.funliday.com/posts/?p=113993) → 실제 발음([할라산])과 가이드북에 맞춰 **ハルラサン** 권장.
- **万丈窟（マンジャングル）**: 地球の歩き方 웹매거진과 newt가 같다. (https://www.arukikata.co.jp/webmagazine/273709/, https://newt.net/kor/cju/spot) 2026년 현재 낙석 점검으로 휴관 중이고 재개 시기는 미정이라는 투어 공지가 있다. (https://www.veltra.com/jp/asia/korea/jeju/a/150357)
- **牛島（ウド）**: newt, NTA, funliday, VELTRA 「ウド (牛島)」. (https://newt.net/kor/cju/spot, https://www.nta.co.jp/media/tripa/articles/VpZrP, https://www.veltra.com/jp/asia/korea/jeju/ctg/171720:ウド_(牛島)/)
- **天地淵瀑布（チョンジヨンポッポ）**: funliday 등. (https://www.funliday.com/posts/?p=113993) 주의할 점이 있다. newt가 쓴 「天帝淵瀑布」는 오기가 아니라 다른 폭포(천제연)다. 검색 요약 하나가 이를 "오기"라고 했는데, 그 요약이 틀렸다. 에어트립 기사도 두 폭포를 따로 든다. (https://newt.net/kor/cju/spot, https://airtrip.jp/travel-column/?p=26883)
- **주상절리대**: 「大浦柱状節理帯」(newt), 「柱状節理帯」(VELTRA 투어명), 「柱状節理帯（大浦洞チサッケ）」(funliday). 출처마다 「大浦」를 붙이기도 하고 빼기도 한다. (https://newt.net/kor/cju/spot, https://www.veltra.com/jp/asia/korea/jeju/a/196479, https://www.funliday.com/posts/?p=113993) 가타카나 독음 「チュサンジョルリデ」를 쓴 1차 출처는 **확인 실패**.
- **섭지코지**: 「ソプチコジ」가 표준이다(funliday, VELTRA 「ソプチコジ(灯台岬)」). 「摂支古地」라는 한자를 쓴 사이트가 하나 있었다는 검색 요약도 있다(어느 페이지인지 특정 못 함). **「渉地可支」라는 일본어 표기는 한 건도 찾지 못했다**(확인 실패). → 가타카나만 쓰고 한자는 쓰지 않는 것을 권장. (https://www.funliday.com/posts/?p=113993, https://www.veltra.com/jp/asia/korea/jeju/ctg/195443:Jeju/reviews/)
- **협재해수욕장**: newt는 「挟才（ヒョプチェ）海水浴場」, aumo는 「狭才海水浴場」. 한자가 갈린다. (https://newt.net/kor/cju/spot, https://aumo.jp/articles/17156) → 「ヒョプチェ海水浴場」처럼 가타카나를 앞세우는 쪽이 안전하다(추론).
- **오름 → オルム**: VisitJeju 일본어판 해시태그 「#済州オルムトレッキング」, VELTRA 「拒文オルム」, funliday는 「オルム（側火山）」처럼 뜻을 덧붙인다. (https://www.visitjeju.net/jp, https://www.veltra.com/jp/asia/korea/jeju/a/150357, https://www.funliday.com/posts/?p=113993)
- **올레 → オルレ**: 「済州オルレ」. 일본에도 「九州オルレ」가 있어서 일본인에게 낯설지 않은 말이다. 「家に帰る細い道」라는 뜻 풀이가 붙어 소개된다. aruco 목차에는 「オルレウォーキング」라고 나온다. (https://yamatogokoro.jp/column/inbound-kyushu/5204/, https://www.maruzenjunkudo.co.jp/products/9784058026359)
- **곶자왈**: 「コッチャワル」(K-TRIP TIPS 「コッチャワル地帯」)과 「ゴッジャワル」(VELTRA 「幻想の森ゴッジャワル」)로 갈린다. (https://www.ktriptips.com/jpn/tourspot/1992617, https://www.veltra.com/jp/asia/korea/jeju/a/180732) → 공사 데이터 형식인 **コッチャワル** 권장. 처음 나올 때는 「溶岩の森」 같은 뜻 풀이를 붙인다(추론).
- **해녀 → 海女**: 「海女さん」(NTA), 「海女（ヘニョ）」(funliday), 「城山浦海女操業公演場」(K-TRIP TIPS). (https://www.nta.co.jp/media/tripa/articles/VpZrP, https://www.funliday.com/posts/?p=113993, https://www.ktriptips.com/jpn/tourspot/229847) 일본에도 해녀가 있어서 번역할 필요가 없는 말이다.
- **오일장**: 「古城5日市場（4、9日）」(K-TRIP TIPS, 아라비아 숫자), 「五日市」(BAILA, 「５日に一度のカラフルな五日市は必見！」). (https://www.ktriptips.com/jpn/tourspot/229847, https://baila.hpplus.jp/lifestyle/trip/6475) 「済州民俗五日市場」이라는 정식 일본어 명칭은 **확인 실패**. 장날은 2·7이 붙는 날이다. (https://wanderlog.com/place/details/145657/제주민속오일시장)
- **귤 따기 → みかん狩り**: 「みかん狩り体験」「みかん収穫体験」. (https://mom-mom.net/jp/travel/places/694502ed48425ea8aaf2a7f0) 귤을 가리킬 때는 「ミカン」(NTA)과 「みかん」(BAILA)이 섞여 쓰인다.
- **제주 자체**: 「済州（チェジュ）」(VisitJeju), 「チェジュ島」(aruco 제목), 「済州島」(大多数). (https://www.visitjeju.net/jp, https://www.maruzenjunkudo.co.jp/products/9784058026359)
- **노을**: 일본어 기사는 「夕日の名所」라고 쓴다. (https://newt.net/kor/cju/spot-706897591)

## 3. 한→일 번역투 함정

근거가 있는 것:
- **같은 장소를 여러 표기로 쓰는 문제**: 한라산 ハルラサン/ハンラサン, 협재 挟才/狭才, 곶자왈 コッチャワル/ゴッジャワル. 한 앱 안에서 표기가 흔들리면 다른 장소로 오해할 수 있다(위 2절 출처). 일본 관광자료를 한국어로 옮긴 사례를 분석한 東北学院大 논문도 같은 문제를 지적했다고 한다. 다만 이 내용은 검색 요약으로만 봤고 본문은 읽지 못했다(PDF 추출 실패). 방향도 일→한이다. (https://www.tohoku-gakuin.ac.jp/research/journal/bk2019/pdf/no01_23.pdf)
- **명사를 직역한 딱딱한 버튼**: VisitJeju 일본어판 설문 버튼 「おすすめ旅行情報を得る」. 일본 앱 관행(「もっと見る」「保存」)과 비교하면 '정보를 얻다'를 그대로 옮긴 말로 보인다(판단은 추론). (https://www.visitjeju.net/jp, https://japanese.visitkorea.or.kr/)
- **한자어를 그대로 옮기는 문제**: 「渉地可支」처럼 한국 한자 표기를 일본 지명으로 그대로 쓰면, 일본 매체에는 없는 말이 된다. 일본 매체는 ソプチコジ를 쓴다(2절).

추론(원어민 검수 필요):
- 「〜곳」을 「〜所」「〜場所」로 기계적으로 옮기기. 일본 앱은 「スポット」「お店」를 더 많이 쓴다.
- 반말 「〜고 싶어」를 「〜たいです」로 존대해 옮기면 버튼이 길고 딱딱해진다. 昭文社 사례처럼 「〜したい」로 끝내는 편이 자연스럽다.
- 「길찾기」를 「道を探す」로 직역하기. 일본 사용자에게 익숙한 말은 Google 지도의 「経路」다.
- 「비 와요」를 「雨が降ります」로 직역하기. 일본 기사 관용구는 「雨の日」다(1차 출처는 확인 실패).

## 4. 권장 용어표

| 한국어 | 권장 일본어 | 근거 |
|---|---|---|
| 푹 쉬고 싶어 | のんびりしたい | 昭文社 「のんびり過ごしたい」(travelvoice.jp/20150728-47357) |
| 좀 걷고 싶어 | ちょっと歩きたい | 추론(「〜したい」형 관행) |
| 새로운 거 해보고 싶어 | 新しいことをしてみたい | 추론 |
| 유명한 데 가 보고 싶어 | 定番スポットに行きたい | 추론(「定番の観光地」라는 표현은 검색 요약에서만 봄) |
| 맛있는 거 먹고 싶어 | おいしいものが食べたい | 추론. 食べログ 「おいしいお店」(apps.apple.com/jp/app/id763377066) |
| 아무거나 골라줘 | おまかせ | 昭文社 「おまかせ」(travelvoice.jp/20150728-47357) |
| 저장 | 保存 | Google 지도(support.google.com/maps/answer/3184808?hl=ja) |
| 가 봤어요 | 行った | Retty·食べログ(app-liv.jp/maps/all/1661/) |
| 다른 3곳 보기 | ほかの3か所を見る | 추론. 공사 「もっと見る」 패턴 |
| 길찾기 | 経路 | Google 지도(luft.co.jp/media/how-to-use-google-maps/) |
| 기준(어디 근처) | 〜の近く / 現在地 | 확인 실패(추론) |
| 비 와요(실내만) | 雨の日（屋内のみ） | 확인 실패(추론) |
| 오일장 / 장날 | 五日市 / 市の立つ日 | 「五日市」(baila.hpplus.jp/lifestyle/trip/6475). 「市の立つ日」는 추론 |
| 노을 | 夕日 | newt.net/kor/cju/spot-706897591 |
| 오름 | オルム | visitjeju.net/jp, veltra 150357 |
| 올레길 | オルレ（済州オルレ） | yamatogokoro.jp/column/inbound-kyushu/5204/ |
| 해안도로 | 海岸道路 | 확인 실패(추론) |
| 곶자왈 | コッチャワル | ktriptips.com/jpn/tourspot/1992617 (ゴッジャワル와 갈림) |
| 해녀 | 海女 | nta.co.jp, ktriptips 229847 |
| 귤 따기 | みかん狩り | mom-mom.net/jp/travel/places/694502ed48425ea8aaf2a7f0 |
| 성산일출봉 | 城山日出峰（ソンサンイルチュルボン） | ktriptips 229847, arukikata 273709 |
| 한라산 | 漢拏山（ハルラサン） | arukikata 273709, nta (ハンラサン 표기도 있음) |
| 만장굴 | 万丈窟（マンジャングル） | arukikata 273709, newt |
| 우도 | 牛島（ウド） | newt, nta, veltra 171720 |
| 천지연폭포 | 天地淵瀑布（チョンジヨンポッポ） | funliday p=113993 (천제연=天帝淵瀑布와 구분) |
| 주상절리대 | 柱状節理帯（大浦） | newt, veltra 196479 |
| 섭지코지 | ソプチコジ | funliday, veltra 195443 (渉地可支는 일본어 사용례 없음) |
| 협재해수욕장 | ヒョプチェ海水浴場（挟才） | newt (aumo는 狭才) |
