/*
 * Activity option lists.
 *
 * The API's trail is append-only and its `action` set grows as features land, so
 * this filter is a *convenience*, not a closed set: an unknown action still
 * renders (via `humaniseEnum`), it just cannot be filtered for. That is the right
 * trade — a filter list that silently hides new activity would be worse than one
 * that lags behind it.
 */

export const ACTIVITY_ACTION_FILTER_OPTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'task_created', label: 'Task created' },
  { value: 'subtask_created', label: 'Subtask created' },
  { value: 'subtask_updated', label: 'Subtask updated' },
  { value: 'subtask_deleted', label: 'Subtask deleted' },
  { value: 'label_assigned', label: 'Label assigned' },
  { value: 'label_removed', label: 'Label removed' },
];
