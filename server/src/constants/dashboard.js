/*
 * Dashboard domain constants.
 *
 * Shared by the validator (which bounds the query parameter) and the service
 * (which defaults it), so the two can never drift apart.
 *
 * The status/priority bucket lists are deliberately NOT duplicated here — the
 * service reads them from the Mongoose schemas so a new enum value is picked
 * up automatically.
 */

export const DEFAULT_UPCOMING_DUE_DAYS = 7;

export const MAX_UPCOMING_DUE_DAYS = 365;

/*
 * Statuses that are no longer actionable.
 *
 * A task in one of these states is never counted as overdue or upcoming:
 * a completed or cancelled task cannot be late, and it is not waiting to
 * be started.
 */
export const CLOSED_TASK_STATUSES = Object.freeze(['completed', 'cancelled']);
