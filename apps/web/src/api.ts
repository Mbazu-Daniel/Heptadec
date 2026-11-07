import type {
  IMe,
  IProvider,
  IProvidersResponse,
} from "@heptadec/api/auth-contracts";
import type { IOrganizationsResponse } from "@heptadec/api/organization-contracts";
import type {
  IMemberProfileResponse,
  IMembersResponse,
} from "@heptadec/api/member-contracts";
import type {
  IImagesConfigResponse,
  IPresignImageResponse,
  ImageTarget,
} from "@heptadec/api/images-contracts";
import type {
  IBillingSummary,
  ISetAutoRenewRequest,
  ISetAutoRenewResponse,
  IStartCheckoutRequest,
  IStartCheckoutResponse,
} from "@heptadec/api/billing-contracts";
import type { Role } from "@heptadec/api/rbac";
import type {
  ApiErrorCode,
  IErrorEnvelope,
} from "@heptadec/api/http-contracts";
import type {
  IAcceptInvitationResponse,
  IInvitationListResponse,
  IInvitationPreviewResponse,
} from "@heptadec/api/invitation-contracts";
import type {
  ICreateDataSourceRequest,
  ICreateDataSourceResponse,
  IDataSourceListResponse,
  IDeleteDataSourceResponse,
  IObjectsResponse,
  IPreviewResponse,
  ITestConnectionResponse,
  IUpdateDataSourceRequest,
  IUpdateDataSourceResponse,
} from "@heptadec/api/data-source-contracts";
import type {
  IAuditLogListResponse,
} from "@heptadec/api/audit-contracts";
import type {
  ICreateMcpTokenResponse,
  IMcpTokenListResponse,
} from "@heptadec/api/mcp-contracts";
import {
  ANSWER_EVENTS,
  type IAnswerDelta,
  type IAnswerProblem,
  type IAnswerSkipped,
  type IAnswerStatus,
  type ICreateAiProviderRequest,
  type ICreateAiProviderResponse,
  type IAiProviderListResponse,
  type IGenerateQueryResponse,
  type IListModelsResponse,
  type IListProviderModelsRequest,
} from "@heptadec/api/ai-contracts";
import type { ISchemaResponse } from "@heptadec/api/schema-contracts";
import type {
  IExplainResponse,
  IMongoPipeline,
  IQueryRefine,
  IQueryRequest,
  ISearchStatement,
  IQueryResponse,
  IRedisQueryResponse,
} from "@heptadec/api/query-contracts";
import type {
  ICreateSavedQueryRequest,
  IQueryVersionListResponse,
  ISavedQuery,
  ISavedQueryListResponse,
  ISavedQueryResponse,
  IUpdateSavedQueryRequest,
} from "@heptadec/api/saved-query-contracts";
import type {
  IApplyProposalResponse,
  IAskDashboardResponse,
  ICreateDashboardRequest,
  ICreateWidgetRequest,
  IDashboardListResponse,
  IDashboardResponse,
  IGenerateDashboardResponse,
  IProposalAction,
  IUpdateDashboardRequest,
  IUpdateWidgetRequest,
  IWidgetData,
  IWidgetResponse,
} from "@heptadec/api/dashboard-contracts";
import type {
  IAlertDeliveryListResponse,
  IAlertRuleListResponse,
  IAlertRuleResponse,
  ICreateAlertRuleRequest,
  IUpdateAlertRuleRequest,
} from "@heptadec/api/alert-contracts";
import type {
  INotificationChannel,
  INotificationChannelListResponse,
  INotificationChannelResponse,
  ISaveNotificationChannelRequest,
} from "@heptadec/api/notification-contracts";
import type {
  ICreateScheduledJobRequest,
  IScheduledJobListResponse,
  IScheduledJobResponse,
  IUpdateScheduledJobRequest,
} from "@heptadec/api/scheduler-contracts";
import type {
  ICreateShareLinkRequest,
  IShareLink,
  IShareLinkListResponse,
  IShareLinkResponse,
  ISharedDashboardResponse,
} from "@heptadec/api/share-link-contracts";

function decodeError(payload: unknown): IErrorEnvelope | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const error = Reflect.get(payload, "error");
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = Reflect.get(error, "code");
  const message = Reflect.get(error, "message");
  if (typeof code !== "string" || typeof message !== "string") {
    return null;
  }
  return { error: { code: code as ApiErrorCode, message } };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function messageFor(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}



async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await res.json();
  if (!res.ok) {
    const envelope = decodeError(payload);
    throw new ApiError(
      envelope?.error.code ?? "request_failed",
      envelope?.error.message ?? res.statusText,
    );
  }
  return payload as T;
}

export function fetchMe(): Promise<IMe> {
  return request<IMe>("/api/me");
}

export async function completeOnboarding(): Promise<void> {
  await request("/api/onboarding/complete", "POST");
}

export async function listProviders(): Promise<IProvider[]> {
  const res = await fetch("/api/providers");
  if (!res.ok) {
    return [];
  }
  const body = (await res.json()) as IProvidersResponse;
  return Array.isArray(body.providers) ? body.providers : [];
}

export function fetchOrganizations(): Promise<IOrganizationsResponse> {
  return request<IOrganizationsResponse>("/api/v1/organization");
}

export async function switchOrganization(organizationId: string): Promise<void> {
  await request("/api/v1/organization/switch", "POST", { organizationId });
}

export async function deleteOrganization(organizationId: string, slug: string): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/delete`, "POST", { slug });
}

export function fetchMemberProfile(organizationId: string): Promise<IMemberProfileResponse> {
  return request<IMemberProfileResponse>(`/api/v1/organization/${organizationId}/member`);
}

export function fetchImagesConfig(): Promise<IImagesConfigResponse> {
  return request<IImagesConfigResponse>("/api/images/config");
}

export function fetchBilling(organizationId: string): Promise<IBillingSummary> {
  return request<IBillingSummary>(`/api/v1/organization/${organizationId}/billing`);
}

export function startCheckout(organizationId: string, payload: IStartCheckoutRequest): Promise<IStartCheckoutResponse> {
  return request<IStartCheckoutResponse>(`/api/v1/organization/${organizationId}/billing/checkout`, "POST", payload);
}

export function setAutoRenew(
  organizationId: string,
  payload: ISetAutoRenewRequest,
): Promise<ISetAutoRenewResponse> {
  return request<ISetAutoRenewResponse>(`/api/v1/organization/${organizationId}/billing/auto-renew`, "POST", payload);
}

export async function uploadImage(organizationId: string, target: ImageTarget, picture: Blob): Promise<string> {
  const signed = await request<IPresignImageResponse>(`/api/v1/organization/${organizationId}/images/presign`, "POST", {
    target,
    contentType: picture.type,
    size: picture.size,
  });
  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: signed.headers,
    body: picture,
  });
  if (!put.ok) {
    throw new Error("That image could not be uploaded.");
  }
  return signed.key;
}

export async function saveMemberProfile(
  organizationId: string,
  payload: { displayName?: string | null; image?: string | null },
): Promise<IMemberProfileResponse> {
  return request<IMemberProfileResponse>(
    `/api/v1/organization/${organizationId}/member`,
    "PATCH",
    payload,
  );
}

export function fetchInvitation(
  invitationId: string,
): Promise<IInvitationPreviewResponse> {
  return request<IInvitationPreviewResponse>(`/api/invitation/${invitationId}`);
}

export async function acceptInvitation(
  invitationId: string,
): Promise<void> {
  await request<IAcceptInvitationResponse>(
    `/api/invitation/${invitationId}/accept`,
    "POST",
  );
}

export function listInvitations(organizationId: string): Promise<IInvitationListResponse> {
  return request<IInvitationListResponse>(`/api/v1/organization/${organizationId}/invitations`);
}

export function listAiProviders(organizationId: string): Promise<IAiProviderListResponse> {
  return request<IAiProviderListResponse>(`/api/v1/organization/${organizationId}/ai/providers`);
}

export function createAiProvider(
  organizationId: string,
  input: ICreateAiProviderRequest,
): Promise<ICreateAiProviderResponse> {
  return request<ICreateAiProviderResponse>(`/api/v1/organization/${organizationId}/ai/providers`, "POST", input);
}

export function listAiProviderModels(
  organizationId: string,
  providerId: string,
): Promise<IListModelsResponse> {
  return request<IListModelsResponse>(`/api/v1/organization/${organizationId}/ai/providers/${providerId}/models`);
}

export function listProviderModels(
  organizationId: string,
  input: IListProviderModelsRequest,
): Promise<IListModelsResponse> {
  return request<IListModelsResponse>(`/api/v1/organization/${organizationId}/ai/providers/models`, "POST", input);
}

export async function removeAiProvider(organizationId: string, providerId: string): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/ai/providers/${providerId}`, "DELETE");
}

export interface IStreamHandlers {
  onStatus?: (message: string) => void;
  onDelta?: (text: string) => void;
  onSkipped?: (titles: string[]) => void;
  onProblem?: (message: string) => void;
}

async function streamRequest<T>(
  path: string,
  body: unknown,
  handlers: IStreamHandlers,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const envelope = decodeError(await response.json());
    throw new ApiError(
      envelope?.error.code ?? "request_failed",
      envelope?.error.message ?? response.statusText,
    );
  }
  if (response.body === null) {
    throw new Error("The stream ended before the answer arrived");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished: T | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let split = buffer.indexOf("\n\n");
    while (split !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const event = readEvent(frame);
      if (event?.name === ANSWER_EVENTS.status) {
        handlers.onStatus?.(readPayload<IAnswerStatus>(event.data).message);
      } else if (event?.name === ANSWER_EVENTS.delta) {
        handlers.onDelta?.(readPayload<IAnswerDelta>(event.data).text);
      } else if (event?.name === ANSWER_EVENTS.skipped) {
        handlers.onSkipped?.(readPayload<IAnswerSkipped>(event.data).titles);
      } else if (event?.name === ANSWER_EVENTS.problem) {
        handlers.onProblem?.(readPayload<IAnswerProblem>(event.data).message);
      } else if (event?.name === ANSWER_EVENTS.done) {
        finished = readPayload<T>(event.data);
      }
      split = buffer.indexOf("\n\n");
    }
  }

  if (finished === null) {
    throw new Error("The stream ended before the answer arrived");
  }
  return finished;
}

export type IAskHandlers = IStreamHandlers;

export async function askQuestion(
  organizationId: string,
  dataSourceIds: readonly string[],
  question: string,
  providerId: string | undefined,
  handlers: IAskHandlers,
): Promise<IGenerateQueryResponse> {
  return streamRequest(
    `/api/v1/organization/${organizationId}/ai/ask`,
    {
      dataSourceIds: [...dataSourceIds],
      question,
      ...(providerId === undefined ? {} : { providerId }),
    },
    handlers,
  );
}

function readEvent(
  frame: string,
): { name: string; data: string } | null {
  let name = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      name = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }
  return data.length === 0 ? null : { name, data: data.join("\n") };
}

function readPayload<T>(data: string): T {
  return JSON.parse(data) as T;
}

export function listMcpTokens(organizationId: string): Promise<IMcpTokenListResponse> {
  return request<IMcpTokenListResponse>(`/api/v1/organization/${organizationId}/mcp-tokens`);
}

export function createMcpToken(
  organizationId: string,
  name: string,
  capabilities: string[],
): Promise<ICreateMcpTokenResponse> {
  return request<ICreateMcpTokenResponse>(`/api/v1/organization/${organizationId}/mcp-tokens`, "POST", {
    name,
    capabilities,
  });
}

export async function revokeMcpToken(organizationId: string, tokenId: string): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/mcp-tokens/${tokenId}`, "DELETE");
}

export function listMembers(organizationId: string): Promise<IMembersResponse> {
  return request<IMembersResponse>(`/api/v1/organization/${organizationId}/members`);
}

export async function setMemberRole(
  organizationId: string,
  memberId: string,
  role: Role,
): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/members/${memberId}`, "PATCH", { role });
}

export async function removeMember(organizationId: string, memberId: string): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/members/${memberId}`, "DELETE");
}

export async function cancelInvitation(organizationId: string, invitationId: string): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/invitations/${invitationId}`, "DELETE");
}

export async function declineInvitation(invitationId: string): Promise<void> {
  await request(`/api/invitation/${invitationId}/decline`, "POST");
}

export function listDataSources(organizationId: string): Promise<IDataSourceListResponse> {
  return request<IDataSourceListResponse>(`/api/v1/organization/${organizationId}/data-sources`);
}

export function createDataSource(
  organizationId: string,
  input: ICreateDataSourceRequest,
): Promise<ICreateDataSourceResponse> {
  return request<ICreateDataSourceResponse>(`/api/v1/organization/${organizationId}/data-sources`, "POST", input);
}

export function updateDataSource(
  organizationId: string,
  id: string,
  input: IUpdateDataSourceRequest,
): Promise<IUpdateDataSourceResponse> {
  return request<IUpdateDataSourceResponse>(
    `/api/v1/organization/${organizationId}/data-sources/${id}`,
    "PATCH",
    input,
  );
}

export function deleteDataSource(
  organizationId: string,
  id: string,
): Promise<IDeleteDataSourceResponse> {
  return request<IDeleteDataSourceResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}`, "DELETE");
}

export function fetchSchema(organizationId: string, dataSourceId: string): Promise<ISchemaResponse> {
  return request<ISchemaResponse>(
    `/api/v1/organization/${organizationId}/data-sources/${dataSourceId}/schema`,
  );
}

export function testDataSourceConnection(
  organizationId: string,
  input: ICreateDataSourceRequest,
): Promise<ITestConnectionResponse> {
  return request<ITestConnectionResponse>(
    `/api/v1/organization/${organizationId}/data-sources/test`,
    "POST",
    input,
  );
}

export function listSourceObjects(organizationId: string, id: string): Promise<IObjectsResponse> {
  return request<IObjectsResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/objects`);
}

export function previewSourceRows(
  organizationId: string,
  id: string,
  object: string,
  query?: string,
): Promise<IPreviewResponse> {
  return request<IPreviewResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/preview`, "POST", {
    object,
    ...(query === undefined ? {} : { query }),
  });
}

export function runQuery(
  organizationId: string,
  id: string,
  sql: string,
  refine: IQueryRefine | null = null,
): Promise<IQueryResponse> {
  const body: IQueryRequest =
    refine === null ? { sql } : { sql, refine };
  return request<IQueryResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/query`, "POST", body);
}

export function runPipeline(
  organizationId: string,
  id: string,
  pipeline: IMongoPipeline,
): Promise<IQueryResponse> {
  const body: IQueryRequest = { mongo: pipeline };
  return request<IQueryResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/query`, "POST", body);
}

export function runRedisCommand(
  organizationId: string,
  id: string,
  command: string,
): Promise<IRedisQueryResponse> {
  return request<IRedisQueryResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/query`, "POST", {
    command,
  });
}

export function runSearch(
  organizationId: string,
  id: string,
  statement: ISearchStatement,
): Promise<IQueryResponse> {
  const body: IQueryRequest = { search: statement };
  return request<IQueryResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/query`, "POST", body);
}

export function listSavedQueries(
  organizationId: string,
  sourceId: string,
): Promise<ISavedQueryListResponse> {
  return request<ISavedQueryListResponse>(
    `/api/v1/organization/${organizationId}/data-sources/${sourceId}/saved-queries`,
  );
}

export function createSavedQuery(
  organizationId: string,
  sourceId: string,
  input: ICreateSavedQueryRequest,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/v1/organization/${organizationId}/data-sources/${sourceId}/saved-queries`,
    "POST",
    input,
  );
}

export function recordRun(
  organizationId: string,
  sourceId: string,
  sql: string,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/v1/organization/${organizationId}/data-sources/${sourceId}/saved-queries/runs`,
    "POST",
    { sql },
  );
}

export function updateSavedQuery(
  organizationId: string,
  id: string,
  input: IUpdateSavedQueryRequest,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/v1/organization/${organizationId}/saved-queries/${id}`,
    "PATCH",
    input,
  );
}

export function deleteSavedQuery(organizationId: string, id: string): Promise<void> {
  return request(`/api/v1/organization/${organizationId}/saved-queries/${id}`, "DELETE");
}

export function listAllSavedQueries(organizationId: string): Promise<ISavedQueryListResponse> {
  return request<ISavedQueryListResponse>(`/api/v1/organization/${organizationId}/saved-queries`);
}

export function listQueryVersions(
  organizationId: string,
  id: string,
): Promise<IQueryVersionListResponse> {
  return request<IQueryVersionListResponse>(`/api/v1/organization/${organizationId}/saved-queries/${id}/versions`);
}

export function restoreQueryVersion(
  organizationId: string,
  id: string,
  versionId: string,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/v1/organization/${organizationId}/saved-queries/${id}/restore`,
    "POST",
    { versionId },
  );
}

export function explainQuery(
  organizationId: string,
  id: string,
  sql: string,
): Promise<IExplainResponse> {
  const body: IQueryRequest = { sql };
  return request<IExplainResponse>(`/api/v1/organization/${organizationId}/data-sources/${id}/explain`, "POST", body);
}

export function listScheduledJobs(organizationId: string): Promise<IScheduledJobListResponse> {
  return request<IScheduledJobListResponse>(`/api/v1/organization/${organizationId}/scheduled-jobs`);
}

export function createScheduledJob(
  organizationId: string,
  input: ICreateScheduledJobRequest,
): Promise<IScheduledJobResponse> {
  return request<IScheduledJobResponse>(`/api/v1/organization/${organizationId}/scheduled-jobs`, "POST", input);
}

export function updateScheduledJob(
  organizationId: string,
  id: string,
  input: IUpdateScheduledJobRequest,
): Promise<IScheduledJobResponse> {
  return request<IScheduledJobResponse>(`/api/v1/organization/${organizationId}/scheduled-jobs/${id}`, "PUT", input);
}

export function deleteScheduledJob(organizationId: string, id: string): Promise<void> {
  return request(`/api/v1/organization/${organizationId}/scheduled-jobs/${id}`, "DELETE");
}

export function listAlertRules(organizationId: string): Promise<IAlertRuleListResponse> {
  return request<IAlertRuleListResponse>(`/api/v1/organization/${organizationId}/alert-rules`);
}

export function createAlertRule(
  organizationId: string,
  input: ICreateAlertRuleRequest,
): Promise<IAlertRuleResponse> {
  return request<IAlertRuleResponse>(`/api/v1/organization/${organizationId}/alert-rules`, "POST", input);
}

export function updateAlertRule(
  organizationId: string,
  id: string,
  input: IUpdateAlertRuleRequest,
): Promise<IAlertRuleResponse> {
  return request<IAlertRuleResponse>(`/api/v1/organization/${organizationId}/alert-rules/${id}`, "PUT", input);
}

export function deleteAlertRule(organizationId: string, id: string): Promise<void> {
  return request(`/api/v1/organization/${organizationId}/alert-rules/${id}`, "DELETE");
}

export function listAlertDeliveries(organizationId: string): Promise<IAlertDeliveryListResponse> {
  return request<IAlertDeliveryListResponse>(`/api/v1/organization/${organizationId}/alert-deliveries`);
}

export function listNotificationChannels(organizationId: string): Promise<INotificationChannelListResponse> {
  return request<INotificationChannelListResponse>(`/api/v1/organization/${organizationId}/notification-channels`);
}

export function createNotificationChannel(
  organizationId: string,
  input: ISaveNotificationChannelRequest,
): Promise<INotificationChannelResponse> {
  return request<INotificationChannelResponse>(
    `/api/v1/organization/${organizationId}/notification-channels`,
    "POST",
    input,
  );
}

export function updateNotificationChannel(
  organizationId: string,
  id: string,
  input: ISaveNotificationChannelRequest,
): Promise<INotificationChannelResponse> {
  return request<INotificationChannelResponse>(
    `/api/v1/organization/${organizationId}/notification-channels/${id}`,
    "PATCH",
    input,
  );
}

export async function deleteNotificationChannel(organizationId: string, id: string): Promise<void> {
  await request(`/api/v1/organization/${organizationId}/notification-channels/${id}`, "DELETE");
}

export function refreshWidgetData(organizationId: string, id: string): Promise<IWidgetData> {
  return request<IWidgetData>(`/api/v1/organization/${organizationId}/widgets/${id}/refresh`, "POST");
}

export function listDashboards(organizationId: string): Promise<IDashboardListResponse> {
  return request<IDashboardListResponse>(`/api/v1/organization/${organizationId}/dashboards`);
}

export function createDashboard(
  organizationId: string,
  name: string,
  dataSourceIds: string[],
): Promise<IDashboardResponse> {
  const body: ICreateDashboardRequest = { name, dataSourceIds };
  return request<IDashboardResponse>(`/api/v1/organization/${organizationId}/dashboards`, "POST", body);
}

export function generateDashboard(
  organizationId: string,
  input: { name: string; dataSourceIds: string[]; brief?: string },
  handlers: IStreamHandlers,
): Promise<IGenerateDashboardResponse> {
  return streamRequest(`/api/v1/organization/${organizationId}/dashboards/generate`, input, handlers);
}

export function askDashboard(
  organizationId: string,
  dashboardId: string,
  question: string,
  handlers: IStreamHandlers,
): Promise<IAskDashboardResponse> {
  return streamRequest(
    `/api/v1/organization/${organizationId}/dashboards/${dashboardId}/ask`,
    { question },
    handlers,
  );
}

export function applyDashboardActions(
  organizationId: string,
  dashboardId: string,
  actions: IProposalAction[],
): Promise<IApplyProposalResponse> {
  return request<IApplyProposalResponse>(
    `/api/v1/organization/${organizationId}/dashboards/${dashboardId}/apply`,
    "POST",
    { actions },
  );
}

export function fetchDashboard(organizationId: string, id: string): Promise<IDashboardResponse> {
  return request<IDashboardResponse>(`/api/v1/organization/${organizationId}/dashboards/${id}`);
}

export function renameDashboard(
  organizationId: string,
  id: string,
  name: string,
): Promise<IDashboardResponse> {
  const body: IUpdateDashboardRequest = { name };
  return request<IDashboardResponse>(`/api/v1/organization/${organizationId}/dashboards/${id}`, "PATCH", body);
}

export function deleteDashboard(organizationId: string, id: string): Promise<void> {
  return request(`/api/v1/organization/${organizationId}/dashboards/${id}`, "DELETE");
}

export function createWidget(
  organizationId: string,
  dashboardId: string,
  input: ICreateWidgetRequest,
): Promise<IWidgetResponse> {
  return request<IWidgetResponse>(
    `/api/v1/organization/${organizationId}/dashboards/${dashboardId}/widgets`,
    "POST",
    input,
  );
}

export function updateWidget(
  organizationId: string,
  id: string,
  input: IUpdateWidgetRequest,
): Promise<IWidgetResponse> {
  return request<IWidgetResponse>(`/api/v1/organization/${organizationId}/widgets/${id}`, "PATCH", input);
}

export function deleteWidget(organizationId: string, id: string): Promise<void> {
  return request(`/api/v1/organization/${organizationId}/widgets/${id}`, "DELETE");
}

export function fetchWidgetData(organizationId: string, id: string): Promise<IWidgetData> {
  return request<IWidgetData>(`/api/v1/organization/${organizationId}/widgets/${id}/data`);
}

export function createShareLink(
  organizationId: string,
  dashboardId: string,
  input: ICreateShareLinkRequest,
): Promise<IShareLinkResponse> {
  return request<IShareLinkResponse>(
    `/api/v1/organization/${organizationId}/dashboards/${dashboardId}/share-links`,
    "POST",
    input,
  );
}

export function listShareLinks(
  organizationId: string,
  dashboardId: string,
): Promise<IShareLinkListResponse> {
  return request<IShareLinkListResponse>(
    `/api/v1/organization/${organizationId}/dashboards/${dashboardId}/share-links`,
  );
}

export function refreshShareLink(organizationId: string, id: string): Promise<IShareLink> {
  return request<IShareLink>(`/api/v1/organization/${organizationId}/share-links/${id}/refresh`, "POST");
}

export function deleteShareLink(organizationId: string, id: string): Promise<void> {
  return request(`/api/v1/organization/${organizationId}/share-links/${id}`, "DELETE");
}

export function fetchSharedDashboard(
  token: string,
): Promise<ISharedDashboardResponse> {
  return request<ISharedDashboardResponse>(`/api/share/${token}`);
}

export interface IAuditLogFilters {
  event?: string;
  target?: string;
  q?: string;
  since?: string;
  until?: string;
}

export function listAuditLogs(
  organizationId: string,
  filters: IAuditLogFilters = {},
): Promise<IAuditLogListResponse> {
  const query = new URLSearchParams();
  if (filters.event !== undefined && filters.event !== "") {
    query.set("event", filters.event);
  }
  if (filters.target !== undefined && filters.target !== "") {
    query.set("target", filters.target);
  }
  if (filters.q !== undefined && filters.q !== "") {
    query.set("q", filters.q);
  }
  if (filters.since !== undefined && filters.since !== "") {
    query.set("since", filters.since);
  }
  if (filters.until !== undefined && filters.until !== "") {
    const end = new Date(`${filters.until}T23:59:59.999`);
    query.set("until", end.toISOString());
  }
  const search = query.toString();
  return request<IAuditLogListResponse>(
    search === "" ? `/api/v1/organization/${organizationId}/audit-logs` : `/api/v1/organization/${organizationId}/audit-logs?${search}`,
  );
}
