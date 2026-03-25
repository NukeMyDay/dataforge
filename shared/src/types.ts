// Core domain types

export type Locale = "de" | "en" | "nl";

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// Education vertical
export interface Program {
  id: number;
  institutionId: number;
  titleDe: string | null;
  titleEn: string | null;
  titleNl: string | null;
  degreeType: string;
  durationMonths: number | null;
  language: string | null;
  deliveryMode: string | null;
  tuitionFeeEur: number | null;
  sourceUrl: string | null;
  country: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Institution {
  id: number;
  nameDe: string | null;
  nameEn: string | null;
  nameNl: string | null;
  country: string;
  city: string | null;
  websiteUrl: string | null;
  accreditationStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Regulatory vertical
export interface Regulation {
  id: number;
  slug: string;
  titleDe: string | null;
  titleEn: string | null;
  category: string;
  jurisdiction: string;
  bodyDe: string | null;
  bodyEn: string | null;
  sourceUrl: string | null;
  effectiveDate: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegulationChangelog {
  id: number;
  regulationId: number;
  version: number;
  diffSummaryDe: string | null;
  diffSummaryEn: string | null;
  changedAt: Date;
}

// API
export interface ApiKey {
  id: number;
  keyHash: string;
  label: string | null;
  ownerId: string | null;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

// Pipelines
export type PipelineStatus = "idle" | "running" | "succeeded" | "failed";

export interface Pipeline {
  id: number;
  name: string;
  description: string | null;
  schedule: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineRun {
  id: number;
  pipelineId: number;
  status: PipelineStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  recordsProcessed: number | null;
  errorMessage: string | null;
  createdAt: Date;
}
