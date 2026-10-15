import { expect, it } from "vitest";
import {
  buildCron,
  DEFAULT_WHEN,
  describeCron,
  type IWhen,
  type TRepeat,
} from "../../web/src/components/schedule-when";
import { nextRunAfter, parseCron } from "../src/modules/scheduler/cron";

const AT: Pick<IWhen, "hour" | "minute"> = { hour: "09", minute: "00" };

it("says what a cron does in words", () => {
  expect(describeCron("0 * * * *")).toBe("Every hour, on the hour");
  expect(describeCron("30 * * * *")).toBe("Every hour, at :30");
  expect(describeCron("0 9 * * *")).toBe("Every day at 09:00");
  expect(describeCron("0 9 * * 1-5")).toBe("Every weekday at 09:00");
  expect(describeCron("0 9 * * 0")).toBe("Every Sunday at 09:00");
  expect(describeCron("30 7 * * 1")).toBe("Every Monday at 07:30");
  expect(describeCron("0 0 * * 1,3")).toBe("Every Monday and Wednesday at 00:00");
  expect(describeCron("0 0 15 * *")).toBe("On the 15th of every month at 00:00");
  expect(describeCron("0 0 1 * *")).toBe("On the 1st of every month at 00:00");
  expect(describeCron("0 0 22 * *")).toBe("On the 22nd of every month at 00:00");
});

it("reads Sunday as Sunday, not Monday", () => {
  expect(describeCron("0 9 * * 0")).toContain("Sunday");
  expect(describeCron("0 9 * * 1")).toContain("Monday");
  expect(describeCron("0 9 * * 6")).toContain("Saturday");
});

it("shows the raw cron rather than guessing", () => {
  expect(describeCron("*/5 * * * *")).toBe("*/5 * * * *");
  expect(describeCron("nonsense")).toBe("nonsense");
  expect(describeCron("0 9 30 2 *")).toBe("0 9 30 2 *");
});

it("builds a cron the server accepts, and describes what it built", () => {
  const cases: Array<[TRepeat, Partial<IWhen>, string]> = [
    ["hourly", { minute: "00" }, "Every hour, on the hour"],
    ["daily", AT, "Every day at 09:00"],
    ["weekly", { ...AT, weekday: "1-5" }, "Every weekday at 09:00"],
    ["weekly", { ...AT, weekday: "0" }, "Every Sunday at 09:00"],
    ["monthly", { ...AT, dayOfMonth: "1" }, "On the 1st of every month at 09:00"],
  ];

  for (const [repeat, parts, described] of cases) {
    const when: IWhen = { ...DEFAULT_WHEN, ...parts, repeat };
    const cron = buildCron(when);
    expect(describeCron(cron), cron).toBe(described);
    expect(
      nextRunAfter(parseCron(cron), "UTC", new Date("2026-03-15T10:00:00Z")).getTime(),
      cron,
    ).toBeGreaterThan(0);
  }
});

it("picks a day of the month that exists in every month", () => {
  const when: IWhen = { ...DEFAULT_WHEN, repeat: "monthly", dayOfMonth: "31" };
  expect(buildCron(when)).toBe("00 09 31 * *");
});
