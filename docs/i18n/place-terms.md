# 장소 글 공통 표기표 (ADR-0093, 잠정)

장소 소개글 번역과 앱 화면(동네 이름)이 같은 표기를 쓰도록 둔 표다. 기준(주인 승인 2026-10-17): 그 언어 원어민·여행 매체가 실제 쓰는 꼴이 먼저, 갈리거나 근거가 없으면 VisitJeju 꼴, 「한국 문화·영토 용어」(아래)가 늘 먼저. 이 표의 이름은 카드 이름(`review/i18n/<lang>/names-*.json`)과 소개글에서 똑같이 쓴다. 근거는 `research-*.md`(R-en·R-ja·R-zh), 근거 없는 줄은 판단.

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

## 부산 세부 지역 12곳 (2026-10-20, plans/busan.md S7)

기준은 위와 같고, 부산은 VisitJeju 대신 **비짓부산(부산관광공사) 그 언어판**의 꼴을 먼저 본다. 「확인」은 2026-10-20 visitbusan.net 중국어(간체)·일본어 첫 화면에서 본 표기, 나머지는 판단(확인 실패: 한국관광공사 다국어 TourAPI는 이 키로 등록되지 않음, 장소 상세는 열지 못함).

| 한국어 | en | ja | zh-Hans |
|---|---|---|---|
| 원도심 | Old Downtown | 旧都心 확인 | 老城区 확인 |
| 자갈치시장 | Jagalchi Market | チャガルチ市場 확인 | 札嘎其市场 확인 |
| 흰여울문화마을 | Huinnyeoul Culture Village | ヒニョウル文化村 확인 | 白川文化村 확인 |
| 감천문화마을 | Gamcheon Culture Village | 甘川文化村 확인 | 甘川文化村 확인 |
| 광안리 | Gwangalli | 広安里 확인 | 广安里 확인 |
| 한국관광공사(출처 줄) | Korea Tourism Organization | 韓国観光公社 | 韩国旅游发展局(공사 중국어 사이트 표기, 독립 리뷰 2026-10-20 n2) |
| 그 밖(다대포·송도·영도·초량·이바구길·서면·동래·금정·범어사·오륙도·용호·광안대교·센텀·해운대·송정·기장·해동용궁사) | `src/i18n/en.ts` | `src/i18n/ja.ts` | `src/i18n/zh-Hans.ts` — 판단 |

## 부산 이름난 곳과 자주 나오는 지명 (2026-10-20, 부산 장소 글 번역용)

기준(ADR-0093 Amendment 2, 부산): 그 언어 원어민·여행 매체가 실제 쓰는 꼴이 먼저, 갈리거나 근거가 없으면 비짓부산(visitbusan.net) 그 언어판, 「한국 문화·영토 용어」(아래)가 늘 먼저. 앱 화면에 이미 있는 이름(`src/i18n/*.ts`)은 그대로 다시 쓰고, 비짓부산과 다르면 칸에 적어 둔다. 근거 칸: 「VB」는 2026-10-20 비짓부산 명소·쇼핑·미식투어·테마여행 목록과 미식 글 3편(길거리음식·해장 별미·맛집골목)의 영어·중국어(간체)·일본어판에서 본 표기(목록 제목은 서술형이 많아 이름 부분만 땄다), 「앱」은 앱 화면 이름, 「media」는 매체 이름을 적었고 검색 결과 요약으로만 본 것은 「검색 요약」이라 적었다, 「판단」은 출처를 보지 않은 것. 한국관광공사 다국어 사이트와 부산시 「2025 부산의 맛」 안내책(4개 언어)은 열지 못했다(확인 실패). 일본어 괄호 가타카나는 소개글에서 처음 나올 때만 붙이고, 카드 이름·앱 화면은 괄호 앞 꼴만 쓴다(앱 海雲台와 같게). 가타카나 독음 자체는 판단(비짓부산 일본어판은 대개 한자만 쓴다).

| 한국어 | en | ja | zh-Hans | 근거 |
|---|---|---|---|---|
| 해운대 | Haeundae | 海雲台（ヘウンデ） | 海云台 | VB, 앱 |
| 해운대해수욕장 | Haeundae Beach | 海雲台海水浴場 | 海云台海水浴场 | VB, 앱 |
| 해운대 블루라인파크(해변열차·스카이캡슐) | Haeundae Blueline Park (Beach Train, Sky Capsule) | 海雲台ブルーラインパーク（海辺列車、スカイカプセル） | 海云台蓝线公园（海岸列车、天空舱） | VB |
| 해운대 그린레일웨이 | Haeundae Green Railway trail | 海雲台グリーンレールウェイ | 海云台绿色铁路步道 | 판단 |
| 해운대수목원 | Haeundae Arboretum | 海雲台樹木園 | 海云台树木园 | VB |
| 해운대온천센터 | Haeundae Hot Spring Center | 海雲台温泉センター | 海云台温泉中心 | 판단 |
| 동백섬 | Dongbaekseom Island | 冬柏島（トンベクソム） | 冬柏岛 | VB |
| 마린시티 | Marine City | マリンシティ | Marine City | VB(en), zh media(creatrip 중문·haniseoul zh-CN, 검색 요약), ja 판단 |
| 더베이101 | The Bay 101 | ザ・ベイ101 | The Bay 101 | zh media(ktriptips chs·creatrip, 검색 요약), en·ja 판단 |
| 부산엑스더스카이 | Busan X the Sky | 釜山エックスザスカイ | 釜山X the SKY | VB |
| 달맞이길 | Dalmajigil Road | タルマジキル（月見道） | 迎月路 | VB |
| 미포 | Mipo | 尾浦（ミポ） | 尾浦 | VB |
| 청사포 | Cheongsapo | 青沙浦（チョンサポ） | 青沙浦 | VB |
| 해리단길 | Haeridan-gil | 海理団通り（ヘリダンキル） | 海理团路 | VB |
| 송정 / 송정해수욕장 | Songjeong / Songjeong Beach | 松亭（ソンジョン） / 松亭海水浴場 | 松亭 / 松亭海水浴场 | VB, 앱 |
| 센텀시티 | Centum City | センタムシティ | Centum City | VB(백화점 지점명, zh도 로마자), 앱 |
| 영화의전당 | Busan Cinema Center | 映画の殿堂 | 电影殿堂 | VB |
| 허심청 | Hurshimchung Spa | 虚心庁（ホシムチョン） | 虚心厅 | VB |
| 광안리 / 광안리해수욕장 | Gwangalli / Gwangalli Beach | 広安里（クァンアンリ） / 広安里海水浴場 | 广安里 / 广安里海水浴场 | VB, 앱 |
| 광안대교 | Gwangan Bridge | 広安大橋 | 广安大桥 | VB(ja·zh), 앱. en은 앱 꼴, VB 영어판은 Gwangandaegyo Bridge |
| 민락(수변공원·회타운) | Millak (Millak Waterside Park, Millak Hoe Town) | 民楽（ミルラク）水辺公園・民楽刺身タウン | 民乐水边公园・民乐生鱼片城 | VB |
| 밀락더마켓 | Millac the Market | ミルラク・ザ・マーケット | Millac the Market | VB |
| 수영 | Suyeong | 水営（スヨン） | 水营 | VB(수영사적공원) |
| 이기대(해안산책로) | Igidae (Igidae Coastal Trail) | 二妓台（イギデ）海岸散策路 | 二妓台海岸散步路 | VB |
| 오륙도 | Oryukdo Islets | 五六島（オリュクト） | 五六岛 | VB, 앱 |
| 오륙도 스카이워크 | Oryukdo Skywalk | 五六島スカイウォーク | 五六岛天空步道 | VB(「부산 3대 스카이워크」 글의 꼴) |
| 황령산 / 황령산 전망대 | Hwangnyeongsan Mountain / Hwangnyeongsan Viewing Lounge | 荒嶺山（ファンニョンサン） / 荒嶺山展望休憩所 | 荒岭山 / 荒岭山观景休息区 | VB |
| 장산 | Jangsan Mountain | 萇山（チャンサン） | 苌山 | VB |
| 서면 | Seomyeon | 西面（ソミョン） | 西面 | VB, 앱 |
| 전포카페거리 | Jeonpo Café Street | 田浦（チョンポ）カフェ通り | 田浦咖啡街 | VB(en·zh), ja 판단(VB의 田浦工具通り 꼴을 따름) |
| 범일동 | Beomil-dong | 凡一洞（ポミルトン） | 凡一洞 | VB |
| 부산시민공원 | Busan Citizens Park | 釜山市民公園 | 釜山市民公园 | VB |
| 송상현광장 | Songsanghyeon Square | 宋象賢（ソンサンヒョン）広場 | 宋象贤广场 | VB |
| 부산 어린이대공원 | Children's Grand Park, Busan | 釜山子供大公園 | 釜山儿童大公园 | VB |
| 부산북항 친수공원 | North Port Waterfront Park | 北港親水公園 | 北港亲水公园 | VB |
| 부산역 | Busan Station | 釜山駅 | 釜山站 | 앱 |
| 초량 이바구길 | Choryang Ibagu-gil | 草梁（チョリャン）イバグキル | 草梁以巴谷路 | VB(en·ja), 앱. **zh 충돌**: 앱은 以巴谷路, VB 중국어판은 늘 「草梁故事路」 |
| 산복도로 | sanbok-doro (hillside road) | 山腹道路（サンボクトロ） | 山腹道路 | VB |
| 남포동 | Nampo-dong | 南浦洞（ナンポドン） | 南浦洞 | VB |
| 자갈치시장 | Jagalchi Market | チャガルチ市場 | 札嘎其市场 | VB, 앱 |
| 국제시장 | Gukje Market | 国際市場（クッチェシジャン） | 国际市场 | VB |
| 부평깡통시장 | Bupyeong Kkangtong Market | 富平（プピョン）カントン市場 | 富平罐头市场 | VB. zh는 VB 안에서도 易拉罐市场·罐头夜市로 갈려 罐头 쪽 판단 |
| BIFF광장 | BIFF Square | BIFF広場 | BIFF广场 | 판단 |
| 보수동책방골목 | Bosu-dong Book Street | 宝水洞（ポスドン）本屋通り | 宝水洞书店街 | VB |
| 용두산공원 | Yongdusan Park | 龍頭山（ヨンドゥサン）公園 | 龙头山公园 | VB |
| 부산타워 | Busan Tower | 釜山タワー | 釜山塔 | zh VB(중국어판 인기검색어), en·ja 판단(VB 제목은 서술형) |
| 부산 차이나타운(상해거리) | Shanghai Street (Busan Chinatown) | 上海通り（釜山チャイナタウン） | 上海街（釜山唐人街） | VB(상해거리), 괄호 차이나타운 판단 |
| 부산영화체험박물관 | Busan Museum of Movies | 釜山映画体験博物館 | 釜山电影体验博物馆 | VB(목록에 「博物」까지만 보여 「館/馆」 붙임) |
| 영도 | Yeongdo | 影島（ヨンド） | 影岛 | VB, 앱 |
| 흰여울문화마을 | Huinnyeoul Culture Village | ヒニョウル文化村 | 白川文化村 | VB, 앱 |
| 태종대 | Taejongdae | 太宗台（テジョンデ） | 太宗台 | VB |
| 봉래산 | Bongnaesan Mountain | 蓬莱山 | 蓬莱山 | VB(zh는 번체 「蓬萊」가 섞여 간체로) |
| 영도 해녀촌 | Yeongdo Haenyeochon (haenyeo village) | 影島海女村 | 影岛海女村 | VB |
| 송도 / 송도해수욕장 | Songdo / Songdo Beach | 松島（ソンド） / 松島海水浴場 | 松岛 / 松岛海水浴场 | VB, 앱 |
| 송도해상케이블카 | Songdo Marine Cable Car | 松島海上ロープウェイ | 松岛海上缆车 | VB(ja·zh), en 판단(VB 영어판은 Songdo Marine Sea Car) |
| 송도용궁구름다리 | Songdo Yonggung Suspension Bridge | 松島竜宮吊橋 | 松岛龙宫云桥 | VB |
| 암남공원 | Amnam Park | 岩南（アムナム）公園 | 岩南公园 | VB(en·zh), ja 판단 |
| 감천문화마을 | Gamcheon Culture Village | 甘川（カムチョン）文化村 | 甘川文化村 | VB, 앱 |
| 다대포 / 다대포해수욕장 | Dadaepo / Dadaepo Beach | 多大浦（タデポ） / 多大浦海水浴場 | 多大浦 / 多大浦海水浴场 | VB, 앱 |
| 몰운대 | Morundae | 没雲台（モルンデ） | 没云台 | 판단 |
| 승학산 | Seunghaksan Mountain | 乗鶴山（スンハクサン） | 乘鹤山 | VB |
| 낙동강 | Nakdonggang River | 洛東江（ナクトンガン） | 洛东江 | VB |
| 을숙도 | Eulsukdo Island | 乙淑島（ウルスクト） | 乙淑岛 | VB |
| 삼락생태공원 | Samnak Eco Park | 三楽（サムラク）エコパーク | 三乐生态公园 | VB |
| 대저생태공원 | Daejeo Eco Park | 大渚（テジョ）生態公園 | 大渚生态公园 | VB |
| 화명생태공원 / 화명수목원 | Hwamyeong Eco Park / Hwamyeong Arboretum | 華明（ファミョン）生態公園 / 華明樹木園 | 华明生态公园 / 华明树木园 | VB |
| 명지 | Myeongji | 鳴旨（ミョンジ） | 鸣旨 | VB |
| 가덕도 / 연대봉 | Gadeokdo Island / Yeondaebong Peak | 加徳島（カドクト） / 煙台峰 | 加德岛 / 烟台峰 | VB |
| 사상근린공원 | Sasang Neighborhood Park | 沙上（ササン）近隣公園 | 沙上近邻公园 | 판단(沙上는 VB 사상생활사박물관) |
| 백양산 | Baegyangsan Mountain | 白楊山（ペギャンサン） | 白杨山 | VB |
| 동래 | Dongnae | 東萊（トンネ） | 东莱 | 앱, VB. **ja 글자 차이**: 앱은 「萊」, VB 일본어판은 거의 「東莱」 |
| 온천장(동래온천) | Oncheonjang (Dongnae hot springs) | 温泉場（オンチョンジャン）・東萊温泉 | 温泉场（东莱温泉） | 판단 |
| 연산동 | Yeonsan-dong | 蓮山洞（ヨンサンドン） | 莲山洞 | 판단 |
| 금정 / 금정산 | Geumjeong / Geumjeongsan Mountain | 金井（クムジョン） / 金井山 | 金井 / 金井山 | VB, 앱 |
| 금정산성 | Geumjeongsanseong Fortress | 金井山城（クムジョンサンソン） | 金井山城 | VB(막걸리 글의 산성 이름), Fortress는 판단 |
| 범어사 | Beomeosa Temple | 梵魚寺（ポモサ） | 梵鱼寺 | VB, 앱 |
| 회동수원지(둘레길) | Hoedong Reservoir Trail | 回東（フェドン）水源池散策路 | 回东水源池步道 | VB |
| 땅뫼산 | Ttangmoesan | タンメ山 | 唐马山 | VB |
| 기장 | Gijang | 機張（キジャン） | 机张 | VB, 앱 |
| 기장시장 | Gijang Market | 機張市場 | 机张市场 | VB |
| 해동용궁사 | Haedong Yonggungsa Temple | 海東龍宮寺（ヘドンヨングンサ） | 海东龙宫寺 | VB, 앱 |
| 오시리아(해안산책로) | Osiria (Osiria Coastal Walk) | オシリア海岸散策路 | 五侍利亚海岸散步路 | VB |
| 롯데월드 어드벤처 부산 | Lotte World Adventure Busan | ロッテワールド・アドベンチャー釜山 | 釜山乐天世界探险世界 | VB |
| 일광 / 일광해수욕장 | Ilgwang / Ilgwang Beach | 日光（イルグァン） / 日光海水浴場 | 日光 / 日光海水浴场 | VB |
| 임랑해수욕장 | Imnang Beach | 林浪（イムナン）海水浴場 | 林浪海水浴场 | VB |
| 대변항 | Daebyeon Port | 大辺港（テビョンハン） | 大边港 | 판단 |
| 연화리 | Yeonhwa-ri | 蓮花里（ヨンファリ） | 莲花里 | 판단 |
| 아홉산숲 | Ahopsan Forest | アホプ（九）山森 | 九峰山林 | VB(ja·zh), en 판단 |
| 홍법사 | Hongbeopsa Temple | 弘法寺（ホンボプサ） | 弘法寺 | VB |
| 달음산 | Dareumsan Mountain | 達陰山 | 达阴山 | VB |
| 부산 치유의 숲 | Busan Healing Forest | 釜山癒しの森 | 釜山治愈之林 | VB |
| 용소웰빙공원 | Yongso Well-Being Park | 龍沼（ヨンソ）ウェルビーイング公園 | 龙沼健康公园 | VB |
| 클럽디오아시스 | Club D Oasis | クラブDオアシス | CLUBD OASIS | VB |
| 키자니아 부산 | KidZania Busan | キッザニア釜山 | 趣志尼亚釜山 | VB |
| F1963 | F1963 | F1963 | F1963 | VB |
| 부산과학체험관 | Busan Science Experience Center | 釜山科学体験館 | 釜山科学体验馆 | 판단 |
| 안데르센 동화마을 | Andersen Fairy Tale Village | アンデルセン童話村 | 安徒生童话村 | 판단 |
| 당산(마을 당산) | dangsan (village guardian shrine) | 堂山（タンサン） | 堂山 | 판단 |
| 갈맷길 | Galmaetgil Trail (Course n) | カルメッキル（n コース） | 釜山海鸥步道（第n路线） | 판단(zh는 원어민 검수 대상) |
| 해파랑길 | Haeparang Trail (Course n) | ヘパランキル（n コース） | 海波浪步道（第n路线） | 판단 |
| 돼지국밥 | dwaeji gukbap (pork and rice soup) | テジクッパ（豚肉クッパ） | 猪肉汤饭 | VB(en Rice and Pork Soup·ja 豚肉クッパ·zh), ja 앞꼴은 media(trifa·holafly, 검색 요약) |
| 국밥 | gukbap (rice soup) | クッパ | 汤饭 | VB(국밥집 이름들) |
| 밀면 | milmyeon (Busan wheat noodles) | ミルミョン（小麦冷麺） | 小麦面 | VB |
| 어묵 | eomuk (fish cake) | オムク（練り物） | 鱼糕 | VB |
| 씨앗호떡 | ssiat hotteok (seed-filled sweet pancake) | 種ホットク（シアッホットク） | 果仁糖饼 | VB |
| 비빔당면 | bibim dangmyeon (spicy glass noodles) | ピビムダンミョン（混ぜ春雨） | 拌粉条 | VB |
| 유부주머니 | yubu jumeoni (fried tofu pouch) | 油揚げの巾着（ユブチュモニ） | 油豆腐福袋 | VB |
| 떡볶이 | tteokbokki | トッポッキ | 辣炒年糕 | VB |
| 꼼장어·곰장어(구이) | grilled kkomjangeo (hagfish) | 焼きヌタウナギ（コムジャンオ） | 烤盲鳗 | VB(ja·zh), en: VB 영어판 Sea eel은 오역이라 hagfish(Stars and Stripes 「2025 부산의 맛」 기사 grilled hagfish, 검색 요약) |
| 짚불곰장어 | straw-fire grilled hagfish | わら焼きヌタウナギ | 稻草火烤盲鳗 | 판단 |
| 붕장어·아나고 | conger eel (anago) | アナゴ | 星鳗 | 판단 |
| 장어(통칭) | eel | ウナギ・アナゴ（글에 따라） | 鳗鱼 | 판단 |
| 낙곱새 | nakgopsae (octopus, beef tripe and shrimp stew) | ナッコプセ | 章鱼肥肠虾锅 | ja media(4travel·NEWT, 검색 요약), en·zh 판단 |
| 조방낙지 | Jobang nakji (spicy octopus stew) | チョバンナクチ | 朝纺辣炒章鱼 | 판단 |
| 낙지볶음 | nakji bokkeum (spicy stir-fried octopus) | ナクチポックム | 辣炒章鱼 | ja media(rurubu), en·zh 판단 |
| 동래파전 | Dongnae pajeon (green onion pancake) | 東萊パジョン（ねぎのチヂミ） | 东莱葱煎饼 | VB(ja 東莱式ねぎのチヂミ·zh), en media(Stars and Stripes) |
| 복국 | bokguk (pufferfish soup) | フグ汁（ポックク） | 河豚汤 | zh media(ktriptips 번체 「河豚湯」, 검색 요약), ja 검색 요약, en 판단 |
| 대게 | snow crab (daege) | ズワイガニ（テゲ） | 雪蟹 | ja media(rurubu), zh media(funliday·대만, 검색 요약), en 판단 |
| 회 | hoe (sliced raw fish) | 刺身（フェ） | 生鱼片 | VB, ja media(rurubu 「フェ（刺身）」) |
| 활어회 | hoe from live fish | 活魚の刺身 | 活鱼生鱼片 | 판단 |
| 물회 | mulhoe (cold raw fish soup) | ムルフェ（冷たい刺身スープ） | 冰镇生鱼片汤 | en media(Stars and Stripes), ja 검색 요약, zh 판단 |
| 해물탕 | haemultang (spicy seafood stew) | ヘムルタン（海鮮鍋） | 海鲜汤 | 판단 |
| 조개구이 | grilled clams (jogae-gui) | 貝焼き | 烤蛤蜊 | VB |
| 재첩국 | jaecheop-guk (marsh clam soup) | シジミスープ（チェチョプクク） | 河蚬汤 | VB |
| 아귀찜 | agujjim (spicy braised monkfish) | アンコウの蒸し物（アグチム） | 辣炖安康鱼 | VB |
| 전복 / 전복죽 | abalone / abalone porridge | アワビ / アワビ粥 | 鲍鱼 / 鲍鱼粥 | VB |
| 기장 멸치 | Gijang anchovies | 機張のカタクチイワシ | 机张鳀鱼 | VB |
| 기장 미역 | Gijang miyeok (seaweed) | 機張わかめ | 机张海带 | VB(zh 「海带」은 VB 꼴, 엄밀히는 裙带菜 — 원어민 검수 대상) |
| 냉채족발 | naengchae jokbal (cold pig's trotter salad) | 豚足の冷菜（ネンチェチョッパル） | 猪蹄冷盘 | VB |
| 양곱창 | yang-gopchang (grilled beef tripe) | 牛コプチャン | 烤牛肠 | VB(ja), en·zh 판단 |
| 칼국수 | kalguksu (knife-cut noodles) | カルグクス | 韩式刀切面 | 판단(「刀削面」은 산시 국수라 쓰지 않음) |
| 막걸리 | makgeolli | マッコリ | 马格利酒 | VB |
| 금정산성막걸리 | Geumjeongsanseong Makgeolli | 金井山城マッコリ | 金井山城马格利酒 | VB |

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
