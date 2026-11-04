// The home's photos held back while the 시작 화면 covers it (render.ts homePhoto, ADR-0116): asked for once it goes.
export function showPhotos(doc: Document): void {
  for (const img of doc.querySelectorAll<HTMLImageElement>('img[data-later]')) {
    img.src = img.dataset.later!;
    img.removeAttribute('data-later');
  }
}
