import { BadRequestException } from "../../common/exceptions";

export interface ICronSchedule {
  minutes: readonly number[];
  hours: readonly number[];
  daysOfMonth: readonly number[];
  months: readonly number[];
  daysOfWeek: readonly number[];
  domRestricted: boolean;
  dowRestricted: boolean;
}

interface IFieldSpec {
  name: string;
  min: number;
  max: number;
  wrap?: number;
}

const FIELDS: readonly IFieldSpec[] = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day of month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day of week", min: 0, max: 7, wrap: 0 },
];

const TERM = /^(\*|\d+-\d+|\d+)(?:\/(\d+))?$/;

function parseField(raw: string, spec: IFieldSpec): Set<number> {
  const values = new Set<number>();
  for (const term of raw.split(",")) {
    const match = TERM.exec(term.trim());
    if (match === null) {
      throw new BadRequestException(
        `That schedule has a ${spec.name} field this app cannot read`,
      );
    }
    const spanText = match[1]!;
    const stepText = match[2];
    if (stepText !== undefined && spanText !== "*" && !spanText.includes("-")) {
      throw new BadRequestException(
        `That schedule has a ${spec.name} step without a range`,
      );
    }
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) {
      throw new BadRequestException(
        `That schedule has a ${spec.name} step that is not a whole number`,
      );
    }

    const [from, to] =
      spanText === "*"
        ? [spec.min, spec.max]
        : spanText.includes("-")
          ? spanText.split("-").map((part) => Number(part)) as [number, number]
          : [Number(spanText), stepText === undefined ? Number(spanText) : spec.max];

    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < spec.min ||
      to > spec.max ||
      from > to
    ) {
      throw new BadRequestException(
        `That schedule has a ${spec.name} outside ${spec.min} to ${spec.max}`,
      );
    }
    for (let value = from; value <= to; value += step) {
      values.add(spec.wrap !== undefined && value === spec.max ? spec.wrap : value);
    }
  }
  if (values.size === 0) {
    throw new BadRequestException(`That schedule's ${spec.name} matches nothing`);
  }
  return values;
}

export function parseCron(expression: string): ICronSchedule {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new BadRequestException(
      "A schedule needs five fields: minute, hour, day, month, weekday",
    );
  }

  const [minutes, hours, daysOfMonth, months, daysOfWeek] = FIELDS.map((spec, index) =>
    parseField(fields[index]!, spec),
  ) as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];

  return {
    minutes: [...minutes].sort((a, b) => a - b),
    hours: [...hours].sort((a, b) => a - b),
    daysOfMonth: [...daysOfMonth].sort((a, b) => a - b),
    months: [...months].sort((a, b) => a - b),
    daysOfWeek: [...daysOfWeek].sort((a, b) => a - b),
    domRestricted: fields[2]!.trim() !== "*",
    dowRestricted: fields[4]!.trim() !== "*",
  };
}

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

interface IWall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timezone, formatter);
  return formatter;
}

function wallAt(epoch: number, timezone: string): IWall {
  const parts = formatterFor(timezone).formatToParts(new Date(epoch));
  const fields = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(fields.get("year"));
  const month = Number(fields.get("month"));
  const day = Number(fields.get("day"));
  return {
    year,
    month,
    day,
    hour: Number(fields.get("hour")),
    minute: Number(fields.get("minute")),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function epochFromWall(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): number {
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = wallAt(asIfUtc, timezone);
  let instant = asIfUtc - instantOffset(first, asIfUtc);
  const second = wallAt(instant, timezone);
  if (landed(second, year, month, day, hour, minute)) {
    return instant;
  }
  return asIfUtc - instantOffset(second, instant);
}

function instantOffset(wall: IWall, epoch: number): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) - epoch;
}

function landed(
  wall: IWall,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): boolean {
  return (
    wall.year === year &&
    wall.month === month &&
    wall.day === day &&
    wall.hour === hour &&
    wall.minute === minute
  );
}

function dayRuns(schedule: ICronSchedule, wall: IWall): boolean {
  const monthOk = schedule.months.includes(wall.month);
  if (schedule.domRestricted && schedule.dowRestricted) {
    return (
      monthOk &&
      (schedule.daysOfMonth.includes(wall.day) || schedule.daysOfWeek.includes(wall.weekday))
    );
  }
  return (
    monthOk &&
    schedule.daysOfMonth.includes(wall.day) &&
    schedule.daysOfWeek.includes(wall.weekday)
  );
}

const SEARCH_DAYS = 4 * 366;

export function nextRunAfter(
  schedule: ICronSchedule,
  timezone: string,
  from: Date,
): Date {
  const after = from.getTime();
  const firstMinute = Math.floor(after / 60_000) * 60_000 + 60_000;
  const start = wallAt(firstMinute, timezone);
  let cursor = epochFromWall(start.year, start.month, start.day, 0, 0, timezone);

  for (let day = 0; day < SEARCH_DAYS; day += 1) {
    const wall = wallAt(cursor, timezone);
    const fireTime = dayRuns(schedule, wall)
      ? firstFireInDay(schedule, wall, timezone, after)
      : null;
    if (fireTime !== null) {
      return new Date(fireTime);
    }
    cursor = epochFromWall(wall.year, wall.month, wall.day + 1, 0, 0, timezone);
  }

  throw new BadRequestException(
    "That schedule has no run time in the next four years",
  );
}

function firstFireInDay(
  schedule: ICronSchedule,
  wall: IWall,
  timezone: string,
  after: number,
): number | null {
  for (const hour of schedule.hours) {
    for (const minute of schedule.minutes) {
      const instant = epochFromWall(
        wall.year,
        wall.month,
        wall.day,
        hour,
        minute,
        timezone,
      );
      if (instant <= after) {
        continue;
      }
      const landedAt = wallAt(instant, timezone);
      if (landedAt.hour === hour && landedAt.minute === minute) {
        return instant;
      }
    }
  }
  return null;
}
