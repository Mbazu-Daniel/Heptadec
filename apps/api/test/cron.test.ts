import { expect, it } from "vitest";
import { isTimezone, nextRunAfter, parseCron } from "../src/modules/scheduler/cron";

function fireTime(
  expression: string,
  timezone: string,
  from: string,
): string {
  return nextRunAfter(parseCron(expression), timezone, new Date(from)).toISOString();
}

function wallTime(timezone: string, instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "medium",
    hourCycle: "h23",
  }).format(new Date(instant));
}

function berlinNine(from: string): string {
  const next = fireTime("0 9 * * *", "Europe/Berlin", from);
  return wallTime("Europe/Berlin", next);
}

it("fires on the next matching minute, never the one it is in", () => {
  expect(fireTime("* * * * *", "UTC", "2026-10-09T12:00:30.000Z")).toBe(
    "2026-10-09T12:01:00.000Z",
  );
  expect(fireTime("* * * * *", "UTC", "2026-10-09T12:01:00.000Z")).toBe(
    "2026-10-09T12:02:00.000Z",
  );
});

it("reads a daily time in the schedule's own timezone", () => {
  expect(berlinNine("2026-10-09T12:00:00.000Z")).toBe("2026-10-10, 09:00:00");
  expect(berlinNine("2026-12-09T12:00:00.000Z")).toBe("2026-12-10, 09:00:00");
  expect(fireTime("0 9 * * *", "Asia/Tokyo", "2026-10-09T12:00:00.000Z")).toBe(
    "2026-10-10T00:00:00.000Z",
  );
});

it("honours steps, ranges and lists", () => {
  expect(fireTime("*/15 * * * *", "UTC", "2026-10-09T12:07:00.000Z")).toBe(
    "2026-10-09T12:15:00.000Z",
  );
  expect(fireTime("0 9-17/4 * * *", "UTC", "2026-10-09T12:05:00.000Z")).toBe(
    "2026-10-09T13:00:00.000Z",
  );
  expect(fireTime("0,30 * * * *", "UTC", "2026-10-09T12:10:00.000Z")).toBe(
    "2026-10-09T12:30:00.000Z",
  );
});

it("treats weekdays the way cron does: Monday to Friday, then the weekend", () => {
  expect(fireTime("0 9 * * 1-5", "UTC", "2026-10-09T12:00:00.000Z")).toBe(
    "2026-10-12T09:00:00.000Z",
  );
  expect(fireTime("0 9 * * 1-5", "UTC", "2026-10-09T23:00:00.000Z")).toBe(
    "2026-10-12T09:00:00.000Z",
  );
});

it("matches either day field when both name days, as Vixie cron does", () => {
  expect(fireTime("0 8 1 * 1", "UTC", "2026-10-09T12:00:00.000Z")).toBe(
    "2026-10-12T08:00:00.000Z",
  );
  expect(fireTime("0 8 * * 1", "UTC", "2026-10-09T12:00:00.000Z")).toBe(
    "2026-10-12T08:00:00.000Z",
  );
});

it("waits for the leap day rather than running on the 29th of a normal February", () => {
  expect(fireTime("0 0 29 2 *", "UTC", "2026-10-09T12:00:00.000Z")).toBe(
    "2028-02-29T00:00:00.000Z",
  );
});

it("skips a wall time the clock jumps over", () => {
  const skipped = fireTime("30 2 * * *", "America/New_York", "2027-03-13T12:00:00.000Z");
  expect(skipped).toBe("2027-03-15T06:30:00.000Z");
  expect(wallTime("America/New_York", skipped)).toBe("2027-03-15, 02:30:00");
});

it("runs the first of an ambiguous wall time when clocks go back", () => {
  const repeated = fireTime("30 1 * * *", "America/New_York", "2026-10-31T12:00:00.000Z");
  expect(repeated).toBe("2026-11-01T05:30:00.000Z");
  expect(wallTime("America/New_York", repeated)).toBe("2026-11-01, 01:30:00");
});

it("refuses a schedule it cannot honour", () => {
  const refused = [
    "not a cron",
    "0 9 * *",                  "0 9 * * * *",              "60 * * * *",               "* 25 * * *",               "0 9 32 * *",               "0 9 * 13 *",               "0 9 * * 8",                "*/0 * * * *",              "5/2 * * * *",              "9-5 * * * *",              "0 0 30 2 *",               "",
  ];

  for (const expression of refused) {
    expect(() =>
      nextRunAfter(parseCron(expression), "UTC", new Date("2026-10-09T12:00:00.000Z")),
    ).toThrowError();
  }
});

it("accepts only timezones the runtime knows", () => {
  expect(isTimezone("Europe/Berlin")).toBe(true);
  expect(isTimezone("UTC")).toBe(true);
  expect(isTimezone("Nope/Nope")).toBe(false);
  expect(isTimezone("")).toBe(false);
});
