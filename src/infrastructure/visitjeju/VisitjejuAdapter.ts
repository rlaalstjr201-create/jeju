import type { VisitjejuApiPort, VisitjejuFetchParams, VisitjejuRawSpot } from '../../application/ports/VisitjejuApiPort.js';

export class VisitjejuApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'VisitjejuApiError';
  }
}

interface VisitjejuAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

// Raw shape returned by the visitjeju API before field flattening
interface VisitjejuApiItem {
  contentsid: string;
  contentscd: { value: string } | string;
  title: string;
  address: string;
  roadaddress: string;
  latitude: string;
  longitude: string;
  tag: string;
  alltag: string;
  introduction: string;
  repPhoto: { descseo?: string; photoid?: { photoid: number; imgpath: string; thumbnailpath: string } } | null;
  region1cd: { value: string } | string;
  region2cd: { value: string } | string;
}

interface VisitjejuApiResponse {
  result: string;
  currentPage: number;
  pageSize: number;
  totalCount: number;
  items: VisitjejuApiItem[];
}

function flattenValue(v: { value: string } | string): string {
  return typeof v === 'object' && v !== null ? v.value : v;
}

function toRawSpot(item: VisitjejuApiItem): VisitjejuRawSpot {
  return {
    contentsid: item.contentsid,
    contentscd: flattenValue(item.contentscd),
    title: item.title,
    address: item.address,
    roadaddress: item.roadaddress,
    latitude: item.latitude,
    longitude: item.longitude,
    tag: item.tag,
    alltag: item.alltag ?? '',
    introduction: item.introduction,
    repPhoto: item.repPhoto?.photoid
      ? { thumbnailpath: item.repPhoto.photoid.thumbnailpath, imgpath: item.repPhoto.photoid.imgpath }
      : null,
    region1cd: flattenValue(item.region1cd),
    region2cd: flattenValue(item.region2cd),
  };
}

export class VisitjejuAdapter implements VisitjejuApiPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: VisitjejuAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.visitjeju.net';
  }

  async *fetchAll(params: VisitjejuFetchParams = {}): AsyncIterable<VisitjejuRawSpot> {
    const pageSize = params.pageSize ?? 100;
    let page = 1;
    let fetched = 0;
    let totalCount: number | undefined;

    do {
      const url = new URL(`${this.baseUrl}/vsjApi/contents/searchList`);
      url.searchParams.set('apiKey', this.apiKey);
      url.searchParams.set('locale', 'kr');
      url.searchParams.set('pageSize', String(pageSize));
      url.searchParams.set('page', String(page));
      if (params.category) url.searchParams.set('category', params.category);
      if (params.region)   url.searchParams.set('region1cd', params.region);

      let data: VisitjejuApiResponse;
      try {
        const res = await fetch(url.toString());
        if (!res.ok) {
          throw new VisitjejuApiError(
            `visitjeju API returned ${res.status}`,
          );
        }
        data = (await res.json()) as VisitjejuApiResponse;
      } catch (err) {
        if (err instanceof VisitjejuApiError) throw err;
        throw new VisitjejuApiError('visitjeju API network error', err);
      }

      if (!data.items || data.items.length === 0) break;

      for (const item of data.items) {
        yield toRawSpot(item);
      }

      fetched += data.items.length;
      totalCount = data.totalCount;
      page++;
    } while (totalCount !== undefined && fetched < totalCount);
  }
}
