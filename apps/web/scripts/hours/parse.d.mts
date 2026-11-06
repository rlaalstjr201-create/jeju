import type { Hours } from '../../src/pick/hours';
export const FIELDS: Record<number, [string, string]>;
export function parseOpen(text: unknown): [number, number] | null;
export function parseClosed(text: unknown): number[] | null;
export function hoursOf(item: Record<string, unknown> | null | undefined): Hours | null;
export function loadHours(path?: string): Map<string, Hours>;
export function applyHours<T extends { id: string }>(spots: T[], hours?: Map<string, Hours>): (T & { hours?: Hours })[];
