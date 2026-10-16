# 장소 글 공통 표기표 (ADR-0093, 잠정)

장소 소개글 번역과 앱 화면(동네 이름)이 같은 표기를 쓰도록 둔 표다. 「잠정」: 장소 이름 표기 기준(VisitJeju·KTO·여행자 사용형이 갈릴 때)은 주인 결정 대기다. 그 결정이 오면 이 표와 `review/i18n/<lang>/` 소개글을 함께 맞춘다. 근거는 `research-*.md`(R-en·R-ja·R-zh), 근거 없는 줄은 판단.

## 동네 15곳과 큰 지명

| 한국어 | en | ja | zh-Hans |
|---|---|---|---|
| 제주(섬) | Jeju | 済州島(짧게 済州) R-ja | 济州岛(짧게 济州) |
| 제주시 / 서귀포시 | Jeju City / Seogwipo | 済州市 / 西帰浦 | 济州市 / 西归浦 |
| 한경 | Hangyeong | 翰京 | 翰京 |
| 한림 | Hallim | 翰林 | 翰林 |
| 애월 | Aewol | 涯月 | 涯月 |
| 신제주 | New Jeju | 新済州 | 新济州 |
| 구제주 | Old Jeju | 旧済州 | 旧济州 |
| 조천 | Jocheon | 朝天 | 朝天 |
| 구좌 | Gujwa | 旧左 | 旧左 |
| 우도 | Udo | 牛島（ウド） R-ja | 牛岛 R-zh |
| 대정 | Daejeong | 大静 | 大静 |
| 안덕 | Andeok | 安徳 | 安德 |
| 중문 | Jungmun | 中文 | 中文旅游区(「中文」 단독 금지, R-zh 3절) |
| 서귀포 시내 | Seogwipo City | 西帰浦市内 | 西归浦市区 |
| 남원 | Namwon | 南元 | 南元 |
| 표선 | Pyoseon | 表善 | 表善 |
| 성산 | Seongsan | 城山 | 城山 |
| 함덕 | Hamdeok | 咸徳 | 咸德 |
| 협재 | Hyeopjae | ヒョプチェ(挟才) R-ja | 挟才 R-zh |
| 월정리 | Woljeong-ri | 月汀里 | 月汀里 R-zh |
| 모슬포 | Moseulpo | 摹瑟浦 | 摹瑟浦 |
| 동문시장 | Dongmun Market | 東門市場 | 东门市场 |
| 올레시장(서귀포매일올레시장) | Olle Market | オルレ市場 | 偶来市场 |

## 이름난 곳(R 4절 표에서)

| 한국어 | en | ja | zh-Hans |
|---|---|---|---|
| 성산일출봉 | Seongsan Ilchulbong (Sunrise Peak) | 城山日出峰 | 城山日出峰 |
| 한라산 | Hallasan | 漢拏山（ハルラサン） | 汉拿山 |
| 천지연폭포 | Cheonjiyeon Falls | 天地淵瀑布 | 天地渊瀑布 |
| 천제연폭포 | Cheonjeyeon Falls | 天帝淵瀑布 | 天帝渊瀑布 |
| 주상절리대 | Jusangjeolli Cliff | 柱状節理帯 | 柱状节理带 |
| 만장굴 | Manjanggul Lava Tube | 万丈窟 | 万丈窟 |
| 섭지코지 | Seopjikoji | ソプチコジ | 涉地可支 |
| 산방산 | Sanbangsan | 山房山 | 山房山 |
| 비양도 | Biyangdo | 飛揚島 | 飞扬岛 R-zh |
| 마라도 / 가파도 | Marado / Gapado | 馬羅島 / 加波島 | 马罗岛 / 加波岛 |
| 오름 | oreum (volcanic cone) | オルム | 火山丘, 고유명 ○○岳 |
| 올레길 | Jeju Olle Trail (Route n) | 済州オルレ（n コース） | 偶来小路（第n路线） |
| 해녀 | haenyeo (women divers) | 海女 | 海女 |
| 오일장 | five-day market | 五日市 | 五日市场 |
| 해안도로 | coastal road | 海岸道路 | 海岸公路 |
| 귤 | tangerine | みかん | 橘子 |

## 한국 문화·영토 용어 (주인 규칙 2026-10-17, 원어민 관용보다 우선)

주인 말: 「절대 김치를 파오차이라고 하던지 이런거는 안돼. 신치라고 제대로 쓰고 중국이 동북공정하는 거를 도우면은 안돼. 우리는 우리의 위치를 지켜야지 비굴할 필요는 없어」. 세 언어 모두에 적용한다. 장소 이름 표기 기준이 정해져도 이 규칙이 먼저다. 금지어는 `tests/i18n-terms.test.ts`가 출하 번역 파일 전부에서 막는다.

| 한국어 | en | zh-Hans | ja | 쓰지 않는 말 |
|---|---|---|---|---|
| 김치 | kimchi | 辛奇 (김치찌개 辛奇汤, 묵은지 老辛奇, 보쌈김치 包肉辛奇) | キムチ | 泡菜, pao cai, パオツァイ |
| 백두산 | Baekdusan (천지 Heavenly Lake) | 白头山 (천지 白头山天池) | 白頭山 | 长白山, 長白山, Changbai |
| 한복 | hanbok | 韩服 | 韓服（ハンボク） | 汉服, Hanfu, 漢服, 朝鲜族服饰 |
| 동해 | East Sea | 东海（韩国东海） | 東海（トンヘ） | Sea of Japan, 日本海 (단독·주 명칭으로) |
| 독도 | Dokdo | 独岛 | 独島（トクト） | Takeshima, 竹島, 竹岛, Liancourt Rocks |
| 고구려·발해 | Goguryeo, Balhae (Korean kingdoms) | 高句丽、渤海（韩国古代国家） | 高句麗、渤海 | 중국 지방정권·중국사 프레임 |
| 한국 음식·옷·풍습 | 한국 것으로 | 「朝鲜族」 프레임 금지. 参鸡汤·拌饭 같은 통용 한자 이름은 써도 된다 | 한국 것으로 | 朝鲜族, 朝鮮族 |

근거:
- 문체부 훈령 제427호 「공공 용어의 외국어 번역 및 표기 지침」(2020-07-15 제정) 제4조제2항제3호나목, 김치 → 辛奇(농식품부 선정 중국어 표기): 문체부 보도설명자료 2021-01-11 https://www.mcst.go.kr/kor/s_notice/expPress/expPressView.jsp?pSeq=18605 . 같은 자료는 제4조제2항제5호로 泡菜를 관용 표기로도 인정했으나, 2021년 7월 개정으로 辛奇를 명시했다는 보도가 있다(서울신문 2021-09-27 https://m.seoul.co.kr/news/2021/09/27/20210927030014 , 헤럴드경제 2026-03-11 https://www.heraldk.com/article/2026031116475831765). 개정 조문 원문은 확인 실패. 이 앱은 주인 규칙에 따라 泡菜를 쓰지 않는다.
- 동해: 정부는 1992년 East Sea를 공식 영문 명칭으로 정했고 국내 제작 영문 지도에는 East Sea만 쓴다(검색 요약, 매일신문 https://www.imaeil.com/page/view/2014021316014477361 , Korea JoongAng Daily https://www.koreajoongangdaily.com/korea/govt-goes-easy-on-east-sea-renaming-demand/11882820).
- 독도: 외교부 일본어 페이지는 「独島」로 쓰고 영유권 분쟁은 없다고 적는다 https://dokdo.mofa.go.kr/m/jp/dokdo/government_position.jsp (검색 요약 경유, 본문 직접 열람은 실패).
- 백두산: 「长白山/창바이산」은 중국 측 명칭이고 백두산의 중국화가 동북공정의 일환으로 비판된다(서울신문 https://www.seoul.co.kr/news/plan/2006/08/10/20060810012003 , YTN 2024 https://www.ytn.co.kr/_ln/0104_202403281300011316). 정부의 백두산 중국어 공식 표기는 확인 실패, 한자 「白頭山」의 간체 「白头山」을 쓴다.
- 한복: 외교부 당국자 「한복은 전 세계의 인정을 받는 우리의 대표적인 문화」(2022, 세계일보 https://www.segye.com/newsView/20220206508479). 「汉服」은 다른 옷(한푸), 「조선족 의복」 프레임은 중국 측 주장으로 보도됨(노컷뉴스 https://nocutnews.co.kr/news/5706271). 영어 hanbok은 OED 등재(같은 보도).
- 동북공정: 고구려·발해를 중국사로 보는 주장이 핵심(경기일보 https://kyeonggi.com/article/200808260295027).
