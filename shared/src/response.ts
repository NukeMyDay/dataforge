// Typed helpers for the standard DataForge API response envelope: { data, meta, error }

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  data: T | null;
  meta: ApiMeta | null;
  error: string | null;
}

/** Successful response with a single data payload. */
export function ok<T>(data: T, meta?: ApiMeta): ApiResponse<T> {
  return { data, meta: meta ?? null, error: null };
}

/** Paginated list response. */
export function paginated<T>(
  data: T[],
  pagination: { page: number; pageSize: number; total: number }
): ApiResponse<T[]> {
  const totalPages = Math.ceil(pagination.total / pagination.pageSize);
  return {
    data,
    meta: { ...pagination, totalPages },
    error: null,
  };
}

/** Error response. data is null. */
export function err(message: string): ApiResponse<null> {
  return { data: null, meta: null, error: message };
}
