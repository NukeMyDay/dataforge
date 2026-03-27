const API_BASE = import.meta.env.VITE_API_URL ?? "";

function getToken(): string | null {
  return localStorage.getItem("dataforge_admin_token");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (res.status === 401) {
    localStorage.removeItem("dataforge_admin_token");
    window.location.href = "/admin/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export interface ListResponse<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  schedule: string | null;
  enabled: boolean;
  lastRun?: PipelineRun | null;
}

export interface PipelineRun {
  id: number;
  pipelineId: number;
  status: "idle" | "running" | "succeeded" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  recordsProcessed: number | null;
  errorMessage: string | null;
}

export interface UserRecord {
  id: number;
  email: string;
  tier: "free" | "pro" | "enterprise";
  status: string;
  isActive: boolean;
  apiKeyCount: number;
  createdAt: string;
}

export interface ApiKeyRecord {
  id: number;
  name: string | null;
  tier: string;
  isActive: boolean;
  ownerId: string | null;
  requestCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface RecentRun extends PipelineRun {
  pipelineName: string;
}

export const adminApi = {
  pipelines: {
    list: () => request<{ data: Pipeline[]; meta: { total: number } }>("/v1/admin/pipelines"),
    trigger: (id: number) =>
      request<{ ok: boolean }>(`/v1/admin/pipelines/${id}/trigger`, { method: "POST" }),
    runs: (id: number, page = 1) =>
      request<{ data: PipelineRun[]; meta: { page: number; pageSize: number; total: number } }>(
        `/v1/admin/pipelines/${id}/runs?page=${page}&pageSize=20`
      ),
  },
  runs: {
    recent: (limit = 20) =>
      request<{ data: RecentRun[]; meta: { total: number; summary: Record<string, number> } }>(
        `/v1/admin/runs?limit=${limit}`
      ),
  },
  programs: {
    list: (params?: { q?: string; page?: number }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set("q", params.q);
      if (params?.page) search.set("page", String(params.page));
      return request<ListResponse<Record<string, unknown>>>(`/v1/programs?${search}`);
    },
  },
  institutions: {
    list: (params?: { q?: string; page?: number }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set("q", params.q);
      if (params?.page) search.set("page", String(params.page));
      return request<ListResponse<Record<string, unknown>>>(`/v1/institutions?${search}`);
    },
  },
  regulations: {
    list: (params?: { q?: string; page?: number }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set("q", params.q);
      if (params?.page) search.set("page", String(params.page));
      return request<ListResponse<Record<string, unknown>>>(`/v1/regulations?${search}`);
    },
  },
  apiKeys: {
    list: () => request<ListResponse<ApiKeyRecord>>("/v1/admin/api-keys"),
    revoke: (id: number) =>
      request<{ ok: boolean }>(`/v1/admin/api-keys/${id}`, { method: "DELETE" }),
  },
  users: {
    list: (params?: { q?: string }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set("q", params.q);
      const qs = search.toString();
      return request<{ data: UserRecord[]; meta: { total: number }; error: null }>(
        `/v1/admin/users${qs ? `?${qs}` : ""}`,
      );
    },
    update: (id: number, patch: { tier?: string; isActive?: boolean }) =>
      request<{ data: UserRecord; meta: null; error: null }>(`/v1/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  },
  settings: {
    list: () =>
      request<{ data: Array<{ key: string; value: string | null }>; meta: { total: number }; error: null }>(
        "/v1/admin/settings"
      ),
    update: (items: Array<{ key: string; value: string | null }>) =>
      request<{ data: { updated: number }; meta: null; error: null }>("/v1/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(items),
      }),
  },
  dataQuality: {
    get: () =>
      request<{
        data: {
          programs: {
            total: number; inactive: number; stale30d: number; stale90d: number;
            completeness: Record<string, number>;
          };
          institutions: {
            total: number; stale30d: number;
            completeness: Record<string, number>;
          };
          regulations: {
            total: number; stale30d: number;
            completeness: Record<string, number>;
          };
        };
        meta: { generatedAt: string };
        error: null;
      }>("/v1/admin/data-quality"),
  },
};
