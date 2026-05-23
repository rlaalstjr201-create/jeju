export interface NaverSearchItem {
  readonly title: string;
  readonly link: string;
  readonly description: string; // snippet, HTML 태그 포함 가능
  readonly postdate: string;    // YYYYMMDD
}

export interface NaverSearchResult {
  readonly query: string;
  readonly items: NaverSearchItem[];
}

export interface NaverSearchApiPort {
  searchBlog(query: string, display?: number): Promise<NaverSearchResult>;
  searchCafe(query: string, display?: number): Promise<NaverSearchResult>;
}
