// 부산 체험 예약 경로 판정 규칙 (plans/busan.md S4b, review/busan/booking/criteria.md 2·3절).
import { describe, expect, it } from 'vitest';
import { addressWords, decide, homepageVerdict, matchNaver, namesMatch, phoneOf, queryOf, snsOrPortal, urlsIn } from '../scripts/busan/booking-routes.mjs';

describe('S4b 판정 규칙', () => {
  it('검색어: 괄호를 지우고 뒤에 부산', () => {
    expect(queryOf('하리선착장(부산)')).toBe('하리선착장 부산');
    expect(queryOf('크레이지서퍼스(크레이지컬처스주식회사)')).toBe('크레이지서퍼스 부산');
  });
  it('이름 맞음: 같거나 두 글자 이상 품음, 머리말 부산·주식회사 뗌', () => {
    expect(namesMatch('주식회사 놀핏', '놀핏')).toBe(true);
    expect(namesMatch('부산 요트투어 요트야', '요트야')).toBe(true);
    expect(namesMatch('송정서핑학교', '서프홀릭')).toBe(false);
  });
  it('전화: 첫 번호, 꼴만 본다', () => {
    expect(phoneOf('문의 051-123-4567, 010-1111-2222')).toBe('tel:0511234567');
    expect(phoneOf('1588-1234')).toBe('tel:15881234');
    expect(phoneOf('0507-1426-9025')).toBe('tel:050714269025');
    expect(phoneOf('없음')).toBeNull();
  });
  it('원문 칸의 주소: 붙어 쓴 한글 꼬리를 떼고, 한글 도메인은 둔다, 스킴 없는 www에 https', () => {
    expect(urlsIn('공식 홈페이지 http://topark.co.kr공식 인스타그램 https://www.instagram.com/x')).toEqual(['http://topark.co.kr/', 'https://www.instagram.com/x']);
    expect(urlsIn('<a href="http://www.xn--pi2b9jw6tva82omwm82nv7e0qi.com/">http://www.삼락수상레포츠타운.com</a>')).toEqual(['http://www.xn--pi2b9jw6tva82omwm82nv7e0qi.com/']);
    expect(urlsIn('www.instagram.com/_yachtya__')).toEqual(['https://www.instagram.com/_yachtya__']);
  });
  it('SNS·누리집은 홈페이지가 아니다, 시설 하위 도메인은 홈페이지', () => {
    expect(snsOrPortal('https://blog.naver.com/x')).toBe('sns');
    expect(snsOrPortal('https://www.sasang.go.kr/tour/index.sasang')).toBe('portal');
    expect(snsOrPortal('https://www.busan.go.kr')).toBe('portal');
    expect(snsOrPortal('http://safe119.busan.go.kr/')).toBeNull();
  });
  it('홈페이지 판정: 200 + 이름 → accepted, 403 → uncertain, 연결 실패 → rejected-dead', () => {
    expect(homepageVerdict('https://a.kr/', { status: 200, url: 'https://a.kr/', html: '<title>바모스 승마클럽</title>' }, ['바모스승마클럽']).verdict).toBe('accepted');
    expect(homepageVerdict('https://a.kr/', { status: 200, url: 'https://a.kr/', html: '<title>Welcome</title>' }, ['바모스승마클럽']).verdict).toBe('uncertain');
    expect(homepageVerdict('https://a.kr/', { status: 403, url: 'https://a.kr/', html: '' }, ['x']).verdict).toBe('uncertain');
    expect(homepageVerdict('https://a.kr/', { error: '연결 실패 ENOTFOUND' }, ['x']).verdict).toBe('rejected-dead');
  });
  it('네이버 장소: 이름이 맞고 300m 안에서 가장 가까운 곳', () => {
    const spot = { name: '서프홀릭 송정 본점', lat: 35.1786, lng: 129.1997 };
    const far = { name: '서프홀릭', lat: 35.19, lng: 129.1997 };
    const near = { name: '서프홀릭 송정', lat: 35.1787, lng: 129.1998 };
    expect(matchNaver([far, near], spot)?.name).toBe('서프홀릭 송정');
    expect(matchNaver([far], spot)).toBeNull();
  });
  it('best는 naver → homepage → phone, 없으면 closed(폐업 표시)나 noroute', () => {
    const r = (kind: string, verdict: string) => ({ kind, url: 'x', evidence: '', verdict });
    expect(decide([r('phone', 'accepted'), r('homepage', 'accepted')], null, false).best).toBe('homepage');
    expect(decide([r('naver', 'rejected-dead')], { name: 'a', closed: true }, false).call).toBe('closed');
    expect(decide([r('homepage', 'uncertain')], null, true)).toMatchObject({ best: null, call: 'noroute' });
    expect(decide([], null, true).reason).toContain('네이버 확인 실패');
  });
  it('주소 낱말: 구·군 다음 두 낱말', () => {
    expect(addressWords('부산광역시 기장군 정관읍 병산1길 102-19')).toEqual(['정관읍', '병산1길']);
  });
});
