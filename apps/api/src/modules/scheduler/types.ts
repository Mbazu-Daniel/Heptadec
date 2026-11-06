import type {
  SavedQueryRow,
  ScheduledJobRow,
} from "@heptadec/db";

export interface ICreateScheduledJobInput {
  savedQueryId: string;
  name: string;
  cron: string;
  timezone: string;
  ttlSeconds: number;
}

export interface IUpdateScheduledJobInput {
  name: string;
  cron: string;
  timezone: string;
  ttlSeconds: number;
}

export interface IScheduledJobForUpdate {
  job: ScheduledJobRow;
  savedQueryName: string;
}

export interface IScheduleFields {
  savedQueryId: string;
  name: string;
  cron: string;
  timezone: string;
  ttlSeconds: number;
}
