// Ticks made without internet, kept in the phone's storage until they can be sent.
// Used only by client components.

export type PendingTick = { memberId: number; taskId: number; date: string; done: boolean; tappedAt: string };

const KEY = "ff_pending_ticks";
const listeners = new Set<() => void>();
let cache: PendingTick[] | null = null;

function load(): PendingTick[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache!;
}

function save(list: PendingTick[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the tick stays in memory for this visit.
  }
  listeners.forEach((l) => l());
}

export function pendingTicks(): PendingTick[] {
  return typeof window === "undefined" ? [] : load();
}

/** Adds a tick; a newer tap on the same item and day replaces the older one. */
export function queueTick(t: PendingTick) {
  save([...load().filter((p) => !(p.taskId === t.taskId && p.date === t.date)), t]);
}

export function dropTick(t: PendingTick) {
  save(load().filter((p) => !(p.taskId === t.taskId && p.date === t.date && p.tappedAt === t.tappedAt)));
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: PendingTick[] = [];
export const serverSnapshot = () => EMPTY;

/** Forgets queued ticks for an item and day (a newer online tick replaced them). */
export function clearTicksFor(taskId: number, date: string) {
  const list = load();
  if (list.some((p) => p.taskId === taskId && p.date === date)) save(list.filter((p) => !(p.taskId === taskId && p.date === date)));
}

/** True for "no connection" errors (fetch failing), as opposed to the server refusing or erroring. */
export function isNetworkError(e: unknown): boolean {
  return !navigator.onLine || (e instanceof TypeError && /fetch|network|load failed/i.test(e.message));
}

/**
 * The page is out of date (e.g. the app was updated while it was open, so its buttons point at
 * code that no longer exists). Reloads to get the new version, at most once a minute so a real
 * server problem can't cause a reload loop. Queued ticks stay queued and are sent after the reload.
 */
export function reloadForNewVersion() {
  const KEY_AT = "ff_reloaded_at";
  try {
    const last = Number(sessionStorage.getItem(KEY_AT) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(KEY_AT, String(Date.now()));
  } catch {
    // no storage: reload anyway
  }
  window.location.reload();
}
