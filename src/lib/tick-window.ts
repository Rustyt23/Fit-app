// Which days a member may tick. Pure functions: used by the server and by phones (offline ticks).
import { addDays, minutes } from "./dates";

/** Yesterday's items can still be ticked until this time today (the "forgot to tick" window). */
export const LATE_TICK_UNTIL = "10:00";

export function inLateWindow(nowHHMM: string): boolean {
  return minutes(nowHHMM) < minutes(LATE_TICK_UNTIL);
}

/** Can an item scheduled on `date` be ticked (or unticked) at `today` + `nowHHMM`? */
export function canTick(date: string, today: string, nowHHMM: string): boolean {
  return date === today || (date === addDays(today, -1) && inLateWindow(nowHHMM));
}

/**
 * The last day whose ticks are final. Before 10 AM yesterday can still change,
 * so events only close once the window is over.
 */
export function lastFinalDay(today: string, nowHHMM: string): string {
  return addDays(today, inLateWindow(nowHHMM) ? -2 : -1);
}
