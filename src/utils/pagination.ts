import { PAGINATION } from '../config/constants';

export interface PageParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export function resolvePage(input: { page?: number; limit?: number }): PageParams {
  const page = Math.max(1, input.page ?? PAGINATION.DEFAULT_PAGE);
  const limit = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, input.limit ?? PAGINATION.DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
