const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      // Public routes don't require auth — API key injected via env for premium
      ...(import.meta.env.VITE_API_KEY
        ? { "X-API-Key": import.meta.env.VITE_API_KEY as string }
        : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }

  return res.json() as Promise<T>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ListResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface DetailResponse<T> {
  data: T;
}

// Funding Programs (Förderprogramme)
export interface FundingProgram {
  id: number;
  slug: string;
  titleDe: string;
  titleEn: string | null;
  description: string | null;
  type: string | null;
  region: string | null;
  targetGroup: string | null;
  fundingAmount: string | null;
  fundingAmountMax: number | null;
  deadline: string | null;
  provider: string | null;
  sourceUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FundingFilter {
  q?: string;
  region?: string;
  type?: string;
  targetGroup?: string;
  page?: number;
  pageSize?: number;
}

export interface StatsResponse {
  data: {
    fundingCount: number;
    regionCount: number;
    lastUpdated: string | null;
    // legacy fields (may be absent)
    programCount?: number;
    institutionCount?: number;
    regulationCount?: number;
    countryCount?: number;
  };
}

export const api = {
  stats: {
    get: () => request<StatsResponse>("/v1/stats"),
  },
  funding: {
    list: (filter: FundingFilter = {}) => {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => {
        if (v !== undefined && v !== "") params.set(k, String(v));
      });
      return request<ListResponse<FundingProgram>>(`/v1/funding?${params}`);
    },
    get: (slug: string) =>
      request<DetailResponse<FundingProgram>>(`/v1/funding/${slug}`),
  },
};
