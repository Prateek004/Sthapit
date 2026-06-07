/**
 * Lightweight async mutex — prevents double-submit and concurrent mutations.
 * No external dependencies. Works in browser + SSR (SSR always gets a fresh instance).
 */

export class Mutex {
  private _queue: Promise<void> = Promise.resolve();

  /** Acquire lock, run fn, release. Returns fn's result. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((res) => { release = res; });
    const current = this._queue;
    this._queue = this._queue.then(() => next);
    await current;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Debounced async executor — collapses rapid calls into one.
 * Used for IDB writes that fire on every state change.
 */
export function debounceAsync(fn: () => Promise<void>, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn().catch(() => {});
    }, delayMs);
  };
}

/**
 * In-flight guard — prevents a function from being called while
 * a previous invocation is still running. Returns false if skipped.
 */
export function createInflightGuard() {
  let inFlight = false;
  return async function guard<T>(fn: () => Promise<T>): Promise<T | null> {
    if (inFlight) return null;
    inFlight = true;
    try {
      return await fn();
    } finally {
      inFlight = false;
    }
  };
}
