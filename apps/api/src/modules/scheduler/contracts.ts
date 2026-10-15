export interface IScheduledJob {
  id: string;
  savedQueryId: string;
  savedQueryName: string;
  name: string;
  cron: string;
  timezone: string;
  ttlSeconds: number;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
}

export interface IScheduledJobListResponse {
  scheduledJobs: IScheduledJob[];
}

export interface IScheduledJobResponse {
  scheduledJob: IScheduledJob;
}

export interface ICreateScheduledJobRequest {
  savedQueryId: string;
  name: string;
  cron: string;
  timezone?: string;
  ttlSeconds?: number;
}

export const MIN_TTL_SECONDS = 60;

export const MAX_TTL_SECONDS = 24 * 60 * 60;

export const DEFAULT_TIMEZONE = "UTC";
