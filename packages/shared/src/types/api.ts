export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiMeta {
  pagination?: Pagination;
  timestamp: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
