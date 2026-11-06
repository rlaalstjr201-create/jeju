// What createRenderer hands its screen sections (ADR-0126): the document, the page's elements and a few shared
// helpers. Each section is a factory that takes this and returns its draw functions.
import type { Els, RenderOptions } from '../render';
import type { MapApp } from '../pick/links';
import type { Reach, Spot } from '../pick/pick';
import type { Origin } from '../types';
import type { RegionName } from '../region/areas';
import type { Dest } from '../region/dest';

export interface Kit {
  doc: Document;
  els: Els;
  opts: RenderOptions;
  win: Window | null;
  /** a timer the renderer clears on dispose */
  later: (ms: number, fn: () => void) => ReturnType<typeof setTimeout>;
  /** motion only when the user hasn't asked for less */
  motion: () => boolean;
  /** an inline icon, parsed once and cloned */
  icon: (markup: string) => Node;
  /** a text button with data-action */
  act: (action: string, text: string) => HTMLButtonElement;
  /** a quiet notice: lines and text buttons */
  fill: (box: HTMLElement, lines: string[], acts: HTMLElement[]) => void;
  /** 길찾기 link of a card */
  setGo: (a: HTMLElement, spot: Spot, origin: Origin | null, reach: Reach, app: MapApp) => void;
  /** run after the next frame is drawn */
  afterPaint: (fn: () => void) => void;
}

/** The basis/area sheet also clears its own timers and draws the area index rows the results notice uses. */
export interface SheetKit extends Kit {
  timers: Set<ReturnType<typeof setTimeout>>;
  areaGroups: (parent: HTMLElement, where: 'inline' | 'basis' | 'stay', selected: RegionName | null, dest?: Dest, sgg?: string | null) => void;
  option: (label: string, sub: string | null, attrs: Record<string, string>) => HTMLButtonElement;
}
