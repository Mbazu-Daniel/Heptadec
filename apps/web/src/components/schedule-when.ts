export type TRepeat = "hourly" | "daily" | "weekly" | "monthly";

export const REPEATS: { id: TRepeat; label: string }[] = [
  { id: "hourly", label: "Every hour" },
  { id: "daily", label: "Every day" },
  { id: "weekly", label: "Every week" },
  { id: "monthly", label: "Every month" },
];

export const WEEKDAYS = [
  { value: "1", short: "Mon", long: "Monday" },
  { value: "2", short: "Tue", long: "Tuesday" },
  { value: "3", short: "Wed", long: "Wednesday" },
  { value: "4", short: "Thu", long: "Thursday" },
  { value: "5", short: "Fri", long: "Friday" },
  { value: "6", short: "Sat", long: "Saturday" },
  { value: "0", short: "Sun", long: "Sunday" },
];

export const WEEKDAY_PRESETS: { value: string; label: string }[] = [
  { value: "1-5", label: "Weekdays" },
  { value: "1,2,3,4,5,6", label: "Mon to Sat" },
  { value: "0", label: "Sundays" },
];

export const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour).padStart(2, "0"),
  label: String(hour).padStart(2, "0"),
}));

export const MINUTES = [0, 15, 30, 45].map((minute) => ({
  value: String(minute).padStart(2, "0"),
  label: minute === 0 ? ":00" : `:${String(minute).padStart(2, "0")}`,
}));

export interface IWhen {
  repeat: TRepeat;
  hour: string;
  minute: string;
  weekday: string;
  dayOfMonth: string;
}

export const DEFAULT_WHEN: IWhen = {
  repeat: "daily",
  hour: "09",
  minute: "00",
  weekday: "1-5",
  dayOfMonth: "1",
};

export function buildCron(when: IWhen): string {
  if (when.repeat === "hourly") {
    return `${when.minute} * * * *`;
  }
  const time = `${when.minute} ${when.hour}`;
  if (when.repeat === "daily") {
    return `${time} * * *`;
  }
  if (when.repeat === "weekly") {
    return `${time} * * ${when.weekday}`;
  }
  return `${time} ${when.dayOfMonth} * *`;
}

export function parseWhen(cron: string): IWhen | null {
  const parts = fields(cron);
  if (parts === null) {
    return null;
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  if (hour === "*") {
    if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
      return null;
    }
    const at = minuteOf(minute);
    return at === null ? null : { ...DEFAULT_WHEN, repeat: "hourly", minute: at };
  }

  const time = clock(minute, hour);
  if (time === null || month !== "*") {
    return null;
  }
  const [atHour, atMinute] = time.split(":");
  if (dayOfMonth === "*" && dayOfWeek === "*") {
    return {
      ...DEFAULT_WHEN,
      repeat: "daily",
      hour: atHour!,
      minute: atMinute!,
    };
  }
  if (dayOfMonth === "*") {
    return {
      ...DEFAULT_WHEN,
      repeat: "weekly",
      weekday: dayOfWeek === "7" ? "0" : dayOfWeek!,
      hour: atHour!,
      minute: atMinute!,
    };
  }
  if (dayOfWeek === "*") {
    return {
      ...DEFAULT_WHEN,
      repeat: "monthly",
      dayOfMonth: dayOfMonth!,
      hour: atHour!,
      minute: atMinute!,
    };
  }
  return null;
}

const FIELD = /^\S+$/;

function fields(cron: string): string[] | null {
  const parts = cron.trim().split(/\s+/);
  return parts.length === 5 && parts.every((part) => FIELD.test(part)) ? parts : null;
}

function clock(minute: string, hour: string): string | null {
  if (!/^\d{1,2}$/.test(hour) || !/^\d{1,2}$/.test(minute)) {
    return null;
  }
  const h = Number(hour);
  const m = Number(minute);
  if (h > 23 || m > 59) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minuteOf(minute: string): string | null {
  if (!/^\d{1,2}$/.test(minute)) {
    return null;
  }
  return Number(minute) <= 59 ? minute.padStart(2, "0") : null;
}

function weekdayNames(field: string): string | null {
  if (field === "*") {
    return "day";
  }
  if (field === "1-5") {
    return "weekday";
  }
  const numbers = field.split(",");
  const spoken: string[] = [];
  for (const value of numbers) {
    const day = WEEKDAYS.find((entry) => entry.value === value);
    if (day === undefined) {
      return null;
    }
    spoken.push(day.long);
  }
  if (spoken.length === 0) {
    return null;
  }
  return spoken.length === 1
    ? spoken[0]!
    : `${spoken.slice(0, -1).join(", ")} and ${spoken.at(-1)}`;
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) {
    return `${day}th`;
  }
  if (day % 10 === 1) {
    return `${day}st`;
  }
  if (day % 10 === 2) {
    return `${day}nd`;
  }
  if (day % 10 === 3) {
    return `${day}rd`;
  }
  return `${day}th`;
}

export function describeCron(cron: string): string {
  const parts = fields(cron);
  if (parts === null) {
    return cron;
  }
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  const everyHour = hour === "*";
  const at = everyHour ? minuteOf(minute) : clock(minute, hour);
  if (at === null) {
    return cron;
  }

  if (everyHour && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return Number(minute) === 0
      ? "Every hour, on the hour"
      : `Every hour, at :${minute}`;
  }

  if (dayOfMonth === "*" && month === "*") {
    if (dayOfWeek === "*") {
      return `Every day at ${at}`;
    }
    const days = weekdayNames(dayOfWeek);
    return days === null ? cron : `Every ${days} at ${at}`;
  }

  if (month === "*" && /^\d{1,2}$/.test(dayOfMonth)) {
    const day = Number(dayOfMonth);
    if (day >= 1 && day <= 28) {
      return `On the ${ordinal(day)} of every month at ${at}`;
    }
  }

  return cron;
}
