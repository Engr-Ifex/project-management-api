import type { ProjectActivity } from '@/lib/api';
import { humaniseEnum } from '@/lib/utils';

/*
 * Turning an activity row into a sentence.
 *
 * The feed used to render `Name` + `humaniseEnum(action)` + a timestamp, which
 * says "task_status_changed" to a human and never names the thing that changed.
 * The metadata has carried the useful part all along — the previous status, the
 * label name, the filename — it was simply not read.
 *
 * `ActivityAction` is an open union (`(string & {})`), so **every** action must
 * fall through to `humaniseEnum` rather than rendering nothing. A new action on
 * the server has to degrade to a readable label, not to a blank row.
 */

export interface ActivityDescription {
  /** The verb phrase. The actor is rendered separately, before it. */
  text: string;
  /** The thing acted on, when the metadata names it. Rendered after `text`. */
  resource?: string;
  /** Where the entry points, when there is somewhere to go. */
  href?: string;
}

const humanise = (value: unknown) => (typeof value === 'string' ? humaniseEnum(value) : undefined);

/** `from X to Y`, tolerating a missing half. */
const transition = (from: unknown, to: unknown, noun: string) => {
  const before = humanise(from);
  const after = humanise(to);

  if (before && after) return `changed the ${noun} from ${before} to ${after}`;
  if (after) return `changed the ${noun} to ${after}`;

  return `changed the ${noun}`;
};

export const describeActivity = (
  entry: ProjectActivity,
  workspaceId: string,
  projectId: string
): ActivityDescription => {
  const meta = (entry.metadata ?? {}) as Record<string, unknown>;

  const str = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : undefined);

  const taskId = str('taskId');
  const taskTitle = str('taskTitle');
  const labelName = str('name');

  const projectHref = `/workspaces/${workspaceId}/projects/${projectId}`;
  const taskHref = taskId
    ? `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
    : undefined;

  const fieldCount = Array.isArray(meta.fields) ? meta.fields.length : undefined;

  /*
   * Most task-scoped actions carry a `taskId` but not always a `taskTitle` — the
   * comment and subtask writers record only the id. A sentence that ends in
   * "commented on" and then nothing reads as broken, so when the title is
   * missing the preposition is dropped and the noun moves into the text.
   */
  const withTask = (phrase: string, withoutTitle: string): ActivityDescription =>
    taskTitle ? { text: phrase, resource: taskTitle, href: taskHref } : { text: withoutTitle, href: taskHref };

  switch (entry.action) {
    case 'created':
      return { text: 'created this project', href: projectHref };
    case 'archived':
      return { text: 'archived this project', href: projectHref };
    case 'restored':
      return { text: 'restored this project', href: projectHref };
    case 'updated':
      return {
        text: fieldCount === 1 ? 'updated 1 field' : `updated ${fieldCount ?? 'some'} fields`,
        href: projectHref,
      };
    case 'status_changed':
      return { text: transition(meta.from, meta.to, 'status'), href: projectHref };

    case 'member_added':
      return { text: 'added a project member', href: projectHref };
    case 'member_removed':
      return { text: 'removed a project member', href: projectHref };
    case 'member_role_changed':
      return {
        text: `changed a member's role to ${humanise(meta.role) ?? 'a new role'}`,
        href: projectHref,
      };

    case 'label_created':
      return { text: 'created the label', resource: labelName, href: projectHref };
    case 'label_updated':
      return { text: 'updated the label', resource: labelName, href: projectHref };
    case 'label_deleted':
      return { text: 'deleted the label', resource: labelName, href: projectHref };
    case 'label_assigned':
      return withTask(
        `added the label ${labelName ?? ''} to`.trim(),
        `added the label ${labelName ?? ''}`.trim()
      );
    case 'label_removed':
      return withTask(
        `removed the label ${labelName ?? ''} from`.trim(),
        `removed the label ${labelName ?? ''}`.trim()
      );

    case 'task_created':
      return { text: 'created the task', resource: taskTitle, href: taskHref };
    case 'task_archived':
      return { text: 'archived the task', resource: taskTitle, href: taskHref };
    case 'task_restored':
      return { text: 'restored the task', resource: taskTitle, href: taskHref };
    case 'task_status_changed':
      return { text: transition(meta.from, meta.to, 'status'), resource: taskTitle, href: taskHref };
    case 'task_priority_changed':
      return {
        text: transition(meta.from, meta.to, 'priority'),
        resource: taskTitle,
        href: taskHref,
      };
    case 'task_assigned':
      return { text: 'assigned the task', resource: taskTitle, href: taskHref };
    case 'task_reassigned':
      return { text: 'reassigned the task', resource: taskTitle, href: taskHref };
    case 'task_unassigned':
      return { text: 'unassigned the task', resource: taskTitle, href: taskHref };

    case 'task_updated': {
      /*
       * Two shapes share this action: a multi-field edit (`fields`) and a
       * single-field edit (`field`/`from`/`to`). The single-field form names the
       * field, which is far more useful, so prefer it when present.
       */
      const field = str('field');

      if (field) {
        return {
          text: transition(meta.from, meta.to, humanise(field) ?? field),
          resource: taskTitle,
          href: taskHref,
        };
      }

      return {
        text: fieldCount === 1 ? 'updated 1 field of' : 'updated',
        resource: taskTitle,
        href: taskHref,
      };
    }

    case 'subtask_created':
      return withTask('added a subtask to', 'added a subtask');
    case 'subtask_updated':
      return withTask('updated a subtask of', 'updated a subtask');
    case 'subtask_deleted':
      return withTask('removed a subtask from', 'removed a subtask');

    case 'task_comment_added':
      return withTask('commented on', 'commented on a task');
    case 'task_comment_updated':
      return withTask('edited a comment on', 'edited a comment');
    case 'task_comment_deleted':
      return withTask('deleted a comment on', 'deleted a comment');

    case 'attachment_uploaded':
      return {
        text: 'uploaded an attachment to',
        resource: str('filename') ?? taskTitle,
        href: taskHref ?? projectHref,
      };
    case 'attachment_deleted':
      return {
        text: 'deleted an attachment from',
        resource: str('originalFilename') ?? str('filename'),
        href: projectHref,
      };

    default:
      // Unknown action: a readable label beats a blank row.
      return { text: humaniseEnum(entry.action), resource: taskTitle, href: taskHref ?? projectHref };
  }
};
