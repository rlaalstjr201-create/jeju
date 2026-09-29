import './style.css';
import { LocateError, inJeju, mountApp } from './app';
import type { Point, Spot } from './pick';

function locate(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocateError('unavailable'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const p = { lat: coords.latitude, lng: coords.longitude };
        if (inJeju(p)) resolve(p);
        else reject(new LocateError('outside'));
      },
      (err) => reject(new LocateError(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

let storage: Storage | null = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}

mountApp(document, {
  loadSpots: () =>
    fetch('./spots.json').then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Spot[]>;
    }),
  locate,
  storage,
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
