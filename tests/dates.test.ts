import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, formatStamp, instantOf, nextMonth, nowHHMM, startOfWeek, timeZone, today, weekday, zonedDateTime } from "@/lib/dates";
import { ist, setNow } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
  delete process.env.APP_TIMEZONE;
});

describe("dates (family timezone = IST)", () => {
  it("defaults to India time wherever the server runs", () => {
    expect(timeZone()).toBe("Asia/Kolkata");
  });

  it("uses India's date, not the server's UTC date", () => {
    setNow("2026-09-28", "01:30"); // still 27 Sept 20:00 in UTC
    expect(today()).toBe("2026-09-28");
    expect(nowHHMM()).toBe("01:30");
  });

  it("finds the instant a day starts in IST", () => {
    expect(new Date(instantOf("2026-09-28")).toISOString()).toBe("2026-09-27T18:30:00.000Z");
  });

  it("handles daylight saving when another timezone is configured", () => {
    process.env.APP_TIMEZONE = "America/New_York";
    expect(new Date(instantOf("2026-11-01")).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(new Date(instantOf("2026-11-02")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("does calendar maths without timezone surprises", () => {
    expect(weekday("2026-09-27")).toBe(0);
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(nextMonth("2026-12-15")).toBe("2027-01-01");
  });

  it("converts a tap time to the family's day and time", () => {
    expect(zonedDateTime(ist("2026-09-27", "23:59").getTime())).toEqual({ date: "2026-09-27", time: "23:59" });
  });

  it("shows stored timestamps in IST (new UTC ones and older local ones)", () => {
    expect(formatStamp("2026-09-27T01:35:00.000Z")).toBe("27 Sept, 7:05 AM");
    expect(formatStamp("2026-09-27 04:49:10")).toBe("27 Sept, 4:49 AM");
  });
});
