/*
 * Pagination constants.
 *
 * The API's own contract: `page` is an integer ≥ 1 defaulting to 1, and `limit`
 * is an integer from **1 to 100** defaulting to 20. `MAX_PAGE_SIZE` is therefore
 * not a preference — sending 200 is a validation error, so any limit control has
 * to stop at 100.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** The choices offered by a page-size control. All within the API's range. */
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
