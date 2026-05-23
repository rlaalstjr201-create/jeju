export interface VisitjejuFetchParams {
  readonly category?: string;  // c1=관광지, c4=음식점 등
  readonly region?: string;    // region1cd
  readonly pageSize?: number;  // default 100
}

export interface VisitjejuRawSpot {
  readonly contentsid: string;
  readonly contentscd: string;
  readonly title: string;
  readonly address: string;
  readonly roadaddress: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly tag: string;
  readonly alltag: string;
  readonly introduction: string;
  readonly repPhoto: { readonly thumbnailpath: string; readonly imgpath: string } | null;
  readonly region1cd: string;
  readonly region2cd: string;
}

export interface VisitjejuApiPort {
  fetchAll(params?: VisitjejuFetchParams): AsyncIterable<VisitjejuRawSpot>;
}
