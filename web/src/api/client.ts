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
  meta: PaginationMeta;
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
  fundingType: string | null;
  fundingArea: string | null;
  fundingRegion: string | null;
  level: string | null;
  state: string | null;
  category: string | null;
  eligibleApplicants: string | null;
  summaryDe: string | null;
  descriptionDe: string | null;
  legalRequirementsDe: string | null;
  directiveDe: string | null;
  fundingAmountInfo: string | null;
  applicationProcess: string | null;
  deadlineInfo: string | null;
  contactInfo: string | null;
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

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AssistantSource {
  title: string;
  url?: string;
  type?: string;
}

export interface AssistantResponse {
  data: {
    reply: string;
    sources: AssistantSource[];
  };
}

// Rechtsformen
export interface Rechtsform {
  id: number;
  name: string;
  slug: string;
  fullName: string | null;
  minCapitalEur: number | null;
  liabilityType: string | null;
  notaryRequired: boolean | null;
  tradeRegisterRequired: boolean | null;
  founderCount: string | null;
  descriptionDe: string | null;
  taxNotesDe: string | null;
  foundingCostsDe: string | null;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
}

// Gewerbeanmeldung
export interface GewerbeanmeldungInfo {
  id: number;
  bundesland: string;
  zustaendigeStelleDescription: string | null;
  kostenEur: number | null;
  bearbeitungszeitTage: number | null;
  requiredDocuments: string[] | null;
  onlineAvailable: boolean | null;
  noteDe: string | null;
  sourceUrl: string;
  createdAt: string;
}

export const api = {
  stats: {
    get: () => request<StatsResponse>("/v1/stats"),
  },
  assistant: {
    chat: (messages: AssistantMessage[]) =>
      request<AssistantResponse>("/v1/assistant", {
        method: "POST",
        body: JSON.stringify({ messages }),
      }),
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
  rechtsformen: {
    list: () => request<ListResponse<Rechtsform>>("/v1/rechtsformen"),
    get: (slug: string) =>
      request<DetailResponse<Rechtsform>>(`/v1/rechtsformen/${slug}`),
  },
  gewerbeanmeldung: {
    list: () => request<ListResponse<GewerbeanmeldungInfo>>("/v1/gewerbeanmeldung"),
    get: (bundesland: string) =>
      request<DetailResponse<GewerbeanmeldungInfo>>(`/v1/gewerbeanmeldung/${bundesland}`),
  },
};
