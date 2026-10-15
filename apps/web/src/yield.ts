// A turn for the browser in the middle of a long job (the first load: the list's text, its parse, tidying it, the
// home's photos — audit 2026-10-15 렉 §2): input and a frame can go first, and no single task runs long.
// scheduler.yield() where there is one (the rest of the job keeps its place in line), else a MessageChannel task
// (a timer would be clamped).
export function yieldToMain(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof s?.yield === 'function') return s.yield();
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}
