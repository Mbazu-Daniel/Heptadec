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
import type {
  ICreateAiProviderRequest,
  ICreateAiProviderResponse,
  IAiProviderListResponse,
  IGenerateQueryResponse,
  IListModelsResponse,
} from "@heptadec/api/ai-contracts";
import type { ISchemaResponse } from "@heptadec/api/schema-contracts";
import type {
  IExplainResponse,
  IMongoPipeline,
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
  return request<IOrganizationsResponse>("/api/organization");
}

export async function switchOrganization(organizationId: string): Promise<void> {
  await request("/api/organization/switch", "POST", { organizationId });
}

export async function deleteOrganization(slug: string): Promise<void> {
  await request("/api/organization/delete", "POST", { slug });
}

export function fetchMemberProfile(): Promise<IMemberProfileResponse> {
  return request<IMemberProfileResponse>("/api/organization/member");
}

export function fetchImagesConfig(): Promise<IImagesConfigResponse> {
  return request<IImagesConfigResponse>("/api/images/config");
}

/**
 * Ask the API to sign an upload, then send the bytes straight to the bucket.
 *
 * The bytes are the file's own: nothing here base64-encodes them, and the API
 * never sees them. What comes back is the path to keep in the database and a URL
 * to PUT the file to.
 */
export async function uploadImage(
  target: ImageTarget,
  picture: Blob,
): Promise<string> {
  const signed = await request<IPresignImageResponse>("/api/images/presign", "POST", {
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
  return signed.path;
}

export async function saveMemberDisplayName(
  displayName: string | null,
): Promise<IMemberProfileResponse> {
  return request<IMemberProfileResponse>("/api/organization/member", "PATCH", {
    displayName,
  });
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

export function listInvitations(): Promise<IInvitationListResponse> {
  return request<IInvitationListResponse>("/api/organization/invitations");
}

export function listAiProviders(): Promise<IAiProviderListResponse> {
  return request<IAiProviderListResponse>("/api/ai/providers");
}

export function createAiProvider(
  input: ICreateAiProviderRequest,
): Promise<ICreateAiProviderResponse> {
  return request<ICreateAiProviderResponse>("/api/ai/providers", "POST", input);
}

export function listAiProviderModels(
  providerId: string,
): Promise<IListModelsResponse> {
  return request<IListModelsResponse>(`/api/ai/providers/${providerId}/models`);
}

export async function removeAiProvider(providerId: string): Promise<void> {
  await request(`/api/ai/providers/${providerId}`, "DELETE");
}

export interface IStreamHandlers<T> {
  onStatus?: (message: string) => void;
  onDelta?: (text: string) => void;
  onSkipped?: (titles: string[]) => void;
  onProblem?: (message: string) => void;
}

async function streamRequest<T>(
  path: string,
  body: unknown,
  handlers: IStreamHandlers<T>,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
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
      if (event?.name === "status") {
        handlers.onStatus?.(readMessage(event.data));
      } else if (event?.name === "delta") {
        handlers.onDelta?.(readMessage(event.data));
      } else if (event?.name === "skipped") {
        const payload = JSON.parse(event.data) as { titles?: string[] };
        handlers.onSkipped?.(payload.titles ?? []);
      } else if (event?.name === "problem") {
        handlers.onProblem?.(readMessage(event.data));
      } else if (event?.name === "done") {
        finished = JSON.parse(event.data) as T;
      }
      split = buffer.indexOf("\n\n");
    }
  }

  if (finished === null) {
    throw new Error("The stream ended before the answer arrived");
  }
  return finished;
}

export type IAskHandlers = IStreamHandlers<IGenerateQueryResponse>;

export async function askQuestion(
  dataSourceIds: readonly string[],
  question: string,
  providerId: string | undefined,
  handlers: IAskHandlers,
): Promise<IGenerateQueryResponse> {
  return streamRequest(
    "/api/ai/ask",
    {
      // An empty list asks every source the organization can ask about.
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

function readMessage(data: string): string {
  const payload = JSON.parse(data) as { message?: string; text?: string };
  return payload.message ?? payload.text ?? "";
}

export function listMcpTokens(): Promise<IMcpTokenListResponse> {
  return request<IMcpTokenListResponse>("/api/mcp-tokens");
}

export function createMcpToken(
  name: string,
  capabilities: string[],
): Promise<ICreateMcpTokenResponse> {
  return request<ICreateMcpTokenResponse>("/api/mcp-tokens", "POST", {
    name,
    capabilities,
  });
}

export async function revokeMcpToken(tokenId: string): Promise<void> {
  await request(`/api/mcp-tokens/${tokenId}`, "DELETE");
}

export function listMembers(): Promise<IMembersResponse> {
  return request<IMembersResponse>("/api/organization/members");
}

export async function setMemberRole(
  memberId: string,
  role: Role,
): Promise<void> {
  await request(`/api/organization/members/${memberId}`, "PATCH", { role });
}

export async function removeMember(memberId: string): Promise<void> {
  await request(`/api/organization/members/${memberId}`, "DELETE");
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await request(`/api/organization/invitations/${invitationId}`, "DELETE");
}

export async function declineInvitation(invitationId: string): Promise<void> {
  await request(`/api/invitation/${invitationId}/decline`, "POST");
}

export function listDataSources(): Promise<IDataSourceListResponse> {
  return request<IDataSourceListResponse>("/api/data-sources");
}

export function createDataSource(
  input: ICreateDataSourceRequest,
): Promise<ICreateDataSourceResponse> {
  return request<ICreateDataSourceResponse>("/api/data-sources", "POST", input);
}

export function updateDataSource(
  id: string,
  input: IUpdateDataSourceRequest,
): Promise<IUpdateDataSourceResponse> {
  return request<IUpdateDataSourceResponse>(
    `/api/data-sources/${id}`,
    "PATCH",
    input,
  );
}

export function deleteDataSource(
  id: string,
): Promise<IDeleteDataSourceResponse> {
  return request<IDeleteDataSourceResponse>(`/api/data-sources/${id}`, "DELETE");
}

export function fetchSchema(dataSourceId: string): Promise<ISchemaResponse> {
  return request<ISchemaResponse>(
    `/api/data-sources/${dataSourceId}/schema`,
  );
}

export function testDataSourceConnection(
  input: ICreateDataSourceRequest,
): Promise<ITestConnectionResponse> {
  return request<ITestConnectionResponse>(
    "/api/data-sources/test",
    "POST",
    input,
  );
}

export function listSourceObjects(id: string): Promise<IObjectsResponse> {
  return request<IObjectsResponse>(`/api/data-sources/${id}/objects`);
}

export function previewSourceRows(
  id: string,
  object: string,
  query?: string,
): Promise<IPreviewResponse> {
  return request<IPreviewResponse>(`/api/data-sources/${id}/preview`, "POST", {
    object,
    ...(query === undefined ? {} : { query }),
  });
}

export function runQuery(id: string, sql: string): Promise<IQueryResponse> {
  const body: IQueryRequest = { sql };
  return request<IQueryResponse>(`/api/data-sources/${id}/query`, "POST", body);
}

export function runPipeline(
  id: string,
  pipeline: IMongoPipeline,
): Promise<IQueryResponse> {
  const body: IQueryRequest = { mongo: pipeline };
  return request<IQueryResponse>(`/api/data-sources/${id}/query`, "POST", body);
}

export function runRedisCommand(
  id: string,
  command: string,
): Promise<IRedisQueryResponse> {
  return request<IRedisQueryResponse>(`/api/data-sources/${id}/query`, "POST", {
    command,
  });
}

/** A search names its own index, because a search source holds many and none of
 * them is the source. */
export function runSearch(
  id: string,
  statement: ISearchStatement,
): Promise<IQueryResponse> {
  const body: IQueryRequest = { search: statement };
  return request<IQueryResponse>(`/api/data-sources/${id}/query`, "POST", body);
}

export function listSavedQueries(
  sourceId: string,
): Promise<ISavedQueryListResponse> {
  return request<ISavedQueryListResponse>(
    `/api/data-sources/${sourceId}/saved-queries`,
  );
}

export function createSavedQuery(
  sourceId: string,
  input: ICreateSavedQueryRequest,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/data-sources/${sourceId}/saved-queries`,
    "POST",
    input,
  );
}

export function recordRun(
  sourceId: string,
  sql: string,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/data-sources/${sourceId}/saved-queries/runs`,
    "POST",
    { sql },
  );
}

export function updateSavedQuery(
  id: string,
  input: IUpdateSavedQueryRequest,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/saved-queries/${id}`,
    "PATCH",
    input,
  );
}

export function deleteSavedQuery(id: string): Promise<void> {
  return request(`/api/saved-queries/${id}`, "DELETE");
}

export function listAllSavedQueries(): Promise<ISavedQueryListResponse> {
  return request<ISavedQueryListResponse>("/api/saved-queries");
}

export function listQueryVersions(
  id: string,
): Promise<IQueryVersionListResponse> {
  return request<IQueryVersionListResponse>(`/api/saved-queries/${id}/versions`);
}

export function restoreQueryVersion(
  id: string,
  versionId: string,
): Promise<ISavedQueryResponse> {
  return request<ISavedQueryResponse>(
    `/api/saved-queries/${id}/restore`,
    "POST",
    { versionId },
  );
}

export function explainQuery(
  id: string,
  sql: string,
): Promise<IExplainResponse> {
  const body: IQueryRequest = { sql };
  return request<IExplainResponse>(`/api/data-sources/${id}/explain`, "POST", body);
}

export function listScheduledJobs(): Promise<IScheduledJobListResponse> {
  return request<IScheduledJobListResponse>("/api/scheduled-jobs");
}

export function createScheduledJob(
  input: ICreateScheduledJobRequest,
): Promise<IScheduledJobResponse> {
  return request<IScheduledJobResponse>("/api/scheduled-jobs", "POST", input);
}

export function deleteScheduledJob(id: string): Promise<void> {
  return request(`/api/scheduled-jobs/${id}`, "DELETE");
}

export function listAlertRules(): Promise<IAlertRuleListResponse> {
  return request<IAlertRuleListResponse>("/api/alert-rules");
}

export function createAlertRule(
  input: ICreateAlertRuleRequest,
): Promise<IAlertRuleResponse> {
  return request<IAlertRuleResponse>("/api/alert-rules", "POST", input);
}

export function deleteAlertRule(id: string): Promise<void> {
  return request(`/api/alert-rules/${id}`, "DELETE");
}

export function listAlertDeliveries(): Promise<IAlertDeliveryListResponse> {
  return request<IAlertDeliveryListResponse>("/api/alert-deliveries");
}

export function listNotificationChannels(): Promise<INotificationChannelListResponse> {
  return request<INotificationChannelListResponse>("/api/notification-channels");
}

export function createNotificationChannel(
  input: ISaveNotificationChannelRequest,
): Promise<INotificationChannelResponse> {
  return request<INotificationChannelResponse>(
    "/api/notification-channels",
    "POST",
    input,
  );
}

export function updateNotificationChannel(
  id: string,
  input: ISaveNotificationChannelRequest,
): Promise<INotificationChannelResponse> {
  return request<INotificationChannelResponse>(
    `/api/notification-channels/${id}`,
    "PATCH",
    input,
  );
}

export async function deleteNotificationChannel(id: string): Promise<void> {
  await request(`/api/notification-channels/${id}`, "DELETE");
}

export function refreshWidgetData(id: string): Promise<IWidgetData> {
  return request<IWidgetData>(`/api/widgets/${id}/refresh`, "POST");
}

export function listDashboards(): Promise<IDashboardListResponse> {
  return request<IDashboardListResponse>("/api/dashboards");
}

export function createDashboard(
  name: string,
  dataSourceIds: string[],
): Promise<IDashboardResponse> {
  const body: ICreateDashboardRequest = { name, dataSourceIds };
  return request<IDashboardResponse>("/api/dashboards", "POST", body);
}

export function generateDashboard(
  input: { name: string; dataSourceIds: string[]; brief?: string },
  handlers: IStreamHandlers<IGenerateDashboardResponse>,
): Promise<IGenerateDashboardResponse> {
  return streamRequest("/api/dashboards/generate", input, handlers);
}

export function askDashboard(
  dashboardId: string,
  question: string,
  handlers: IStreamHandlers<IAskDashboardResponse>,
): Promise<IAskDashboardResponse> {
  return streamRequest(
    `/api/dashboards/${dashboardId}/ask`,
    { question },
    handlers,
  );
}

export function applyDashboardActions(
  dashboardId: string,
  actions: IProposalAction[],
): Promise<IApplyProposalResponse> {
  return request<IApplyProposalResponse>(
    `/api/dashboards/${dashboardId}/apply`,
    "POST",
    { actions },
  );
}

export function fetchDashboard(id: string): Promise<IDashboardResponse> {
  return request<IDashboardResponse>(`/api/dashboards/${id}`);
}

export function renameDashboard(
  id: string,
  name: string,
): Promise<IDashboardResponse> {
  const body: IUpdateDashboardRequest = { name };
  return request<IDashboardResponse>(`/api/dashboards/${id}`, "PATCH", body);
}

export function deleteDashboard(id: string): Promise<void> {
  return request(`/api/dashboards/${id}`, "DELETE");
}

export function createWidget(
  dashboardId: string,
  input: ICreateWidgetRequest,
): Promise<IWidgetResponse> {
  return request<IWidgetResponse>(
    `/api/dashboards/${dashboardId}/widgets`,
    "POST",
    input,
  );
}

export function updateWidget(
  id: string,
  input: IUpdateWidgetRequest,
): Promise<IWidgetResponse> {
  return request<IWidgetResponse>(`/api/widgets/${id}`, "PATCH", input);
}

export function deleteWidget(id: string): Promise<void> {
  return request(`/api/widgets/${id}`, "DELETE");
}

export function fetchWidgetData(id: string): Promise<IWidgetData> {
  return request<IWidgetData>(`/api/widgets/${id}/data`);
}

export function createShareLink(
  dashboardId: string,
  input: ICreateShareLinkRequest,
): Promise<IShareLinkResponse> {
  return request<IShareLinkResponse>(
    `/api/dashboards/${dashboardId}/share-links`,
    "POST",
    input,
  );
}

export function listShareLinks(
  dashboardId: string,
): Promise<IShareLinkListResponse> {
  return request<IShareLinkListResponse>(
    `/api/dashboards/${dashboardId}/share-links`,
  );
}

export function refreshShareLink(id: string): Promise<IShareLink> {
  return request<IShareLink>(`/api/share-links/${id}/refresh`, "POST");
}

export function deleteShareLink(id: string): Promise<void> {
  return request(`/api/share-links/${id}`, "DELETE");
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
    search === "" ? "/api/audit-logs" : `/api/audit-logs?${search}`,
  );
}
