import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BROAD, callWithRetry, keyword1, keywordsOf, placeVolume, plan, RETRIES } from '../scripts/busan/measure.mjs';

// 부산 검색수 측정 S4 (docs/research/busan-popularity/criteria-01.md): 키워드 규칙은 측정 전에 고정한다.

const root = resolve(__dirname, '..');
const ks = (title: string, contenttypeid = 12, others: string[] = []) => keywordsOf({ title, contenttypeid }, new Set(others)).map((x) => x.k);

describe('키워드 규칙 (2절)', () => {
  it('K1: 카드 이름에서 끝 괄호를 떼고 글자·숫자만, 라틴 글자는 대문자', () => {
    expect(keyword1({ title: '감천문화마을', contenttypeid: 12 }).k).toBe('감천문화마을');
    expect(keyword1({ title: '장산 (부산 국가지질공원)', contenttypeid: 12 }).k).toBe('장산');
    expect(keyword1({ title: '이엘 16.52 (EL16.52)', contenttypeid: 39 }).k).toBe('이엘1652');
    expect(keyword1({ title: 'F1963', contenttypeid: 14 }).k).toBe('F1963');
  });
  it('K1: 이름 끝 「(부산)」, 세 글자 이하 음식점은 부산 + 이름', () => {
    expect(keyword1({ title: '범어사(부산)', contenttypeid: 12 }).k).toBe('부산범어사');
    expect(keyword1({ title: '할매집', contenttypeid: 39 }).k).toBe('부산할매집');
    expect(keyword1({ title: '할매집', contenttypeid: 12 }).k).toBe('할매집');
    expect(keyword1({ title: '초량밀면', contenttypeid: 39 }).k).toBe('초량밀면');
  });
  it('K2: 따로 쓴 앞 「부산」과 「국립」을 떼고, 세 글자 이상 남을 때만', () => {
    expect(ks('부산 자갈치시장')).toEqual(['부산자갈치시장', '자갈치시장']);
    expect(ks('국립부산과학관')).toEqual(['국립부산과학관', '부산과학관']);
    expect(ks('부산박물관')).toEqual(['부산박물관']);
    expect(ks('부산 중앙공원')).toEqual(['부산중앙공원']);
  });
  it('K3: 괄호 안 다른 이름(쉼표로 나눔), 「부산」이나 「~」가 든 괄호는 설명이라 뺀다', () => {
    expect(ks('부산 차이나타운(상해문,상해거리)')).toEqual(['부산차이나타운', '상해문', '상해거리']);
    expect(ks('해운대 그린레일웨이 (미포~송정 구간)')).toEqual(['해운대그린레일웨이']);
    expect(ks('문화공감 수정(부산 수정동 일본식 가옥)')).toEqual(['문화공감수정']);
    expect(ks('러블리가든(사계, 나를심다)')).toEqual(['러블리가든', '나를심다']);
  });
  it('K4: 끝의 장소 종류 말을 뗀다(음식점 아님), 동네 이름·다른 곳 이름이면 재지 않는다', () => {
    expect(ks('홍연폭포')).toEqual(['홍연폭포']);
    expect(ks('해운대해수욕장')).toEqual(['해운대해수욕장']);
    expect(ks('이기대해안산책로', 12, ['이기대'])).toEqual(['이기대해안산책로']);
    expect(ks('이기대해안산책로')).toEqual(['이기대해안산책로', '이기대']);
    expect(ks('철마한우수목원', 39)).toEqual(['철마한우수목원']);
  });
  it('K5: 음식점의 본점 낱말을 뗀다, 세 글자 이하면 부산 + 이름', () => {
    expect(ks('이재모피자 본점', 39)).toEqual(['이재모피자본점', '이재모피자']);
    expect(ks('금수복국 해운대본점', 39)).toEqual(['금수복국해운대본점', '금수복국']);
    expect(ks('개미집 본점', 39)).toEqual(['개미집본점', '부산개미집']);
    expect(ks('솥이랑 서면점', 39)).toEqual(['솥이랑서면점']);
  });
  it('뺄 말 목록은 측정 전에 고정한 것 그대로', () => {
    expect(BROAD.has('해운대')).toBe(true);
    expect(BROAD.size).toBe(28);
  });
});

describe('측정 대상과 계획 파일 (1절·4절)', () => {
  it('keep 995곳 전부, 계획 파일이 규칙이 만드는 것과 같다', () => {
    const committed = JSON.parse(readFileSync(resolve(root, 'review/busan/pop-01-plan.json'), 'utf8'));
    const rows = plan();
    expect(rows).toHaveLength(995);
    expect(committed.rows).toEqual(rows);
    expect(committed.calls).toBe(Math.ceil(committed.keywords / 5));
  });
  it('곳의 값: K1이 없으면 확인 실패(null), 다른 키워드가 없으면 그것만 합에서 빠진다', () => {
    expect(placeVolume([{ volume: 10 }, { volume: 5 }])).toBe(15);
    expect(placeVolume([{ volume: 10 }, { volume: null }])).toBe(10);
    expect(placeVolume([{ volume: null }, { volume: 50 }])).toBeNull();
  });
});

describe('재시도 (5절)', () => {
  const keys = { customer: 'c', api: 'a', secret: 's' };
  const sleep = async () => {};
  it('응답 없음·429·5xx만 두 번까지 다시, 그 밖의 상태는 한 번', async () => {
    let n = 0;
    const flaky = async () => (++n < 3 ? { status: 429 as const, rows: null } : { status: 200 as const, rows: [] });
    expect(await callWithRetry(['a'], keys, flaky, sleep)).toMatchObject({ status: 200, tries: 3 });
    n = 0;
    const down = async () => (n++, { status: 'network' as const, rows: null });
    expect((await callWithRetry(['a'], keys, down, sleep)).tries).toBe(RETRIES + 1);
    n = 0;
    const bad = async () => (n++, { status: 400 as const, rows: null });
    expect(await callWithRetry(['a'], keys, bad, sleep)).toMatchObject({ status: 400, tries: 1 });
  });
});
