const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Normalise `page` / `limit` query values into a safe page, limit and skip.
 *
 * Values are clamped rather than rejected so list endpoints stay forgiving,
 * while the validators still reject clearly malformed input.
 */
export const buildPagination = ({ page, limit } = {}) => {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);

  const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const safeLimit =
    Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

/**
 * Build the pagination metadata block returned alongside paginated lists.
 */
export const paginationMeta = ({ page, limit, total }) => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export { DEFAULT_LIMIT, MAX_LIMIT };
