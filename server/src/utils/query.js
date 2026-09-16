import { buildPagination, paginationMeta } from './pagination.js';

/*
 * Reusable query helpers.
 *
 * These exist so that every list endpoint builds its filter, sort and
 * pagination the same way. The important property is that they are the only
 * place user input becomes part of a MongoDB query:
 *
 *   - search terms are regex-escaped, so a term is matched literally
 *   - sort fields are resolved against a whitelist, never used verbatim
 *   - filters are assembled field by field from validated values, so no
 *     operator or field name can ever be supplied by a caller
 */

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * Escape regex metacharacters in a user-supplied search term.
 *
 * Without this a term like `.*` would match every document, and a crafted
 * pattern could be used for a denial-of-service attempt.
 */
export const escapeRegex = (value) => String(value).replace(REGEX_METACHARACTERS, '\\$&');

/**
 * Case-insensitive "contains" search across the given fields.
 *
 * Returns `null` when there is nothing to search for, so callers can drop the
 * clause entirely rather than adding a match-everything filter.
 */
export const buildSearchFilter = (term, fields) => {
  if (typeof term !== 'string' || term.length === 0 || fields.length === 0) {
    return null;
  }

  const pattern = new RegExp(escapeRegex(term), 'i');

  return { $or: fields.map((field) => ({ [field]: pattern })) };
};

/**
 * Build a `$gte` / `$lte` range clause from already-validated bounds.
 * Returns `null` when neither bound is present.
 */
export const buildDateRange = (from, to) => {
  const range = {};

  if (from) range.$gte = from;
  if (to) range.$lte = to;

  return Object.keys(range).length > 0 ? range : null;
};

/**
 * Resolve a sort specification against a whitelist.
 *
 * A field that is not allow-listed falls back to the resource default rather
 * than being passed through — the validator already rejects such values, so
 * this is the second line of defence.
 *
 * A trailing `_id` is appended as a tiebreaker: without a total order, rows
 * sharing the sort value can be repeated or skipped across pages.
 */
export const buildSort = (
  { sortBy, order } = {},
  allowedFields,
  defaultSort,
  defaultOrder = 'desc'
) => {
  if (typeof sortBy !== 'string' || !allowedFields.includes(sortBy)) {
    return { ...defaultSort };
  }

  const direction = order === 'asc' || order === 'desc' ? order : defaultOrder;

  const sort = { [sortBy]: direction === 'asc' ? 1 : -1 };

  if (sortBy !== '_id') {
    sort._id = 1;
  }

  return sort;
};

/**
 * Combine filter clauses, dropping the ones that produced nothing.
 */
export const mergeFilters = (...clauses) =>
  Object.assign({}, ...clauses.filter((clause) => clause !== null && clause !== undefined));

/**
 * Run a paginated list query.
 *
 * Returns the page of documents plus the shared pagination metadata block, so
 * every list endpoint reports progress identically.
 */
export const findPaginated = async (
  Model,
  { filter = {}, sort, populate, select, query = {} } = {}
) => {
  const { page, limit, skip } = buildPagination(query);

  const find = Model.find(filter);

  if (select) find.select(select);
  if (populate) find.populate(populate);

  const [items, total] = await Promise.all([
    find.sort(sort).skip(skip).limit(limit),
    Model.countDocuments(filter),
  ]);

  return {
    items,
    pagination: paginationMeta({ page, limit, total }),
  };
};
