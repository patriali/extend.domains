// Outbound request plumbing for the background context: a per-host
// concurrency gate (spec §7) and a single-flight helper so concurrent
// lookups of the same domain share one promise.

const MAX_PER_HOST = 2;

const active = new Map<string, number>();
const waiting = new Map<string, Array<() => void>>();

function acquire(host: string): Promise<void> {
  const n = active.get(host) ?? 0;
  if (n < MAX_PER_HOST) {
    active.set(host, n + 1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const q = waiting.get(host) ?? [];
    q.push(resolve);
    waiting.set(host, q);
  });
}

function release(host: string): void {
  const next = waiting.get(host)?.shift();
  if (next !== undefined) {
    next(); // slot handed over, active count unchanged
    return;
  }
  const n = (active.get(host) ?? 1) - 1;
  if (n <= 0) active.delete(host);
  else active.set(host, n);
}

/** fetch() gated to MAX_PER_HOST concurrent requests per host. */
export async function queuedFetch(
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
): Promise<Response> {
  const host = new URL(url).host;
  await acquire(host);
  try {
    return await fetch(url, init);
  } finally {
    release(host);
  }
}

const inFlight = new Map<string, Promise<unknown>>();

/** Concurrent callers with the same key share one in-flight promise. */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing as Promise<T>;
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}
