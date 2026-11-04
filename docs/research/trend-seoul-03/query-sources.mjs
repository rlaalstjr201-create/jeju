// 트렌드 03 출처 조회 (00-preregistration.md 「새 출처」): S6 YouTube Data API. 한 번만 돌린다.
// 키는 저장소 루트 .env에서 읽고 어디에도 남기지 않는다. 결과: 02-sources.json(판정용 원자료).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = (k) => {
  for (const line of readFileSync(resolve(here, '../../../.env'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0 && line.slice(0, i).trim() === k) return line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
};
const key = env('YOUTUBE_API_KEY');
const API = 'https://www.googleapis.com/youtube/v3';
const calls = { search: 0, videos: 0 };
const errors = [];
const scrub = (s) => String(s).split(key).join('<key>');
const videos = new Map();

for (const [area, q] of [['성수', '성수 팝업'], ['홍대', '홍대 팝업'], ['이태원', '이태원 팝업'], ['이태원', '한남 팝업']]) {
  let pageToken = '';
  for (let page = 1; page <= 2 && calls.search < 8; page++) {
    calls.search++;
    try {
      const p = new URLSearchParams({ part: 'snippet', q, type: 'video', order: 'date', regionCode: 'KR', relevanceLanguage: 'ko', publishedAfter: '2026-10-01T00:00:00+09:00', maxResults: '50', key });
      if (pageToken) p.set('pageToken', pageToken);
      const j = await (await fetch(`${API}/search?${p}`)).json();
      if (j.error) throw new Error(j.error.message);
      for (const it of j.items ?? []) {
        const id = it.id?.videoId;
        if (!id) continue;
        const v = videos.get(id) ?? { id, areas: [], queries: [], title: it.snippet.title, channel: it.snippet.channelTitle, published: it.snippet.publishedAt, link: `https://www.youtube.com/watch?v=${id}` };
        if (!v.areas.includes(area)) v.areas.push(area);
        if (!v.queries.includes(q)) v.queries.push(q);
        videos.set(id, v);
      }
      pageToken = j.nextPageToken ?? '';
      if (!pageToken) break;
    } catch (e) {
      errors.push(`search ${q} p${page}: ${scrub(e.message)}`);
      break;
    }
  }
}

// 전체 설명: videos.list, 50개씩
const ids = [...videos.keys()];
for (let i = 0; i < ids.length; i += 50) {
  calls.videos++;
  try {
    const p = new URLSearchParams({ part: 'snippet', id: ids.slice(i, i + 50).join(','), key });
    const j = await (await fetch(`${API}/videos?${p}`)).json();
    if (j.error) throw new Error(j.error.message);
    for (const it of j.items ?? []) {
      const v = videos.get(it.id);
      if (v) {
        v.title = it.snippet.title;
        v.description = it.snippet.description;
        v.tags = it.snippet.tags ?? [];
      }
    }
  } catch (e) {
    errors.push(`videos ${i}: ${scrub(e.message)}`);
  }
}

const result = { startedAt: new Date().toISOString(), day: '2026-11-05', s6: [...videos.values()], calls, errors };
writeFileSync(resolve(here, '02-sources.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ s6: result.s6.length, calls, errors }));
