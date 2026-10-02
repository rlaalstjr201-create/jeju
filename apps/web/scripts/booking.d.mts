export type BookKind = 'naver' | 'mrt' | 'visitjeju' | 'homepage' | 'phone';
export declare const BOOK_KINDS: readonly BookKind[];
export declare function loadBookRoutes(path?: string): Map<string, { k: BookKind; u: string }>;
export declare function loadBookingCalls(path?: string): Map<string, 'closed' | 'noroute'>;
export declare function applyBooking<T extends { id: string; name: string; mood: string; sub?: string }>(
  spots: T[],
  routes?: Map<string, { k: BookKind; u: string }>,
  calls?: Map<string, 'closed' | 'noroute'>,
): T[];
