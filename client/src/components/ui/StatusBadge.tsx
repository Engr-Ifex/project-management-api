import { cn } from '@/lib/cn';
import { Badge, StatusDot, type BadgeProps } from './Badge';

/*
 * Domain badges
 *
 * The API's enumerations rendered against the semantic palette. These live in
 * the design system rather than in each page because the mapping is a product
 * decision — "in review" is amber, "urgent" is red — and it must be identical
 * on the task list, the board, the dashboard and the detail panel. A status
 * that changes colour between screens is a bug the user cannot report.
 *
 * Every mapping below matches a value in `server/docs/API.md`. The union types
 * are the API's own enums, so adding a status server-side is a compile error
 * here rather than a silently unstyled chip.
 */

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';

/*
 * `BadgeProps['tone']` is optional, so it includes null and undefined. Every
 * mapping below is total — there is a tone for every enum member — so the
 * narrower type is the honest one.
 */
type Tone = NonNullable<BadgeProps['tone']>;

const TASK_STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'To do', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'accent' },
  in_review: { label: 'In review', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const TASK_PRIORITY: Record<TaskPriority, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'warning' },
  high: { label: 'High', tone: 'caution' },
  urgent: { label: 'Urgent', tone: 'danger' },
};

const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  active: { label: 'Active', tone: 'accent' },
  on_hold: { label: 'On hold', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const WORKSPACE_ROLE: Record<WorkspaceRole, { label: string; tone: Tone }> = {
  owner: { label: 'Owner', tone: 'accent' },
  admin: { label: 'Admin', tone: 'neutral' },
  member: { label: 'Member', tone: 'neutral' },
};

const PROJECT_ROLE: Record<ProjectRole, { label: string; tone: Tone }> = {
  owner: { label: 'Owner', tone: 'accent' },
  admin: { label: 'Admin', tone: 'neutral' },
  member: { label: 'Member', tone: 'neutral' },
  viewer: { label: 'Viewer', tone: 'neutral' },
};

interface DomainBadgeProps {
  /** `dot` is the compact form for dense lists; `chip` is the full badge. */
  variant?: 'chip' | 'dot';
  className?: string;
}

export const TaskStatusBadge = ({
  status,
  variant = 'chip',
  className,
}: DomainBadgeProps & { status: TaskStatus }) => {
  const config = TASK_STATUS[status];

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-body-muted', className)}>
        <StatusDot tone={config.tone} />
        {config.label}
      </span>
    );
  }

  return (
    <Badge tone={config.tone} size="md" className={className}>
      {config.label}
    </Badge>
  );
};

export const TaskPriorityBadge = ({
  priority,
  variant = 'chip',
  className,
}: DomainBadgeProps & { priority: TaskPriority }) => {
  const config = TASK_PRIORITY[priority];

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-body-muted', className)}>
        <StatusDot tone={config.tone} />
        {config.label}
      </span>
    );
  }

  return (
    <Badge tone={config.tone} size="md" className={className}>
      {config.label}
    </Badge>
  );
};

export const ProjectStatusBadge = ({
  status,
  variant = 'chip',
  className,
}: DomainBadgeProps & { status: ProjectStatus }) => {
  const config = PROJECT_STATUS[status];

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-body-muted', className)}>
        <StatusDot tone={config.tone} />
        {config.label}
      </span>
    );
  }

  return (
    <Badge tone={config.tone} size="md" className={className}>
      {config.label}
    </Badge>
  );
};

export const WorkspaceRoleBadge = ({ role, className }: { role: WorkspaceRole; className?: string }) => {
  const config = WORKSPACE_ROLE[role];

  return (
    <Badge tone={config.tone} variant="outline" size="sm" className={className}>
      {config.label}
    </Badge>
  );
};

export const ProjectRoleBadge = ({ role, className }: { role: ProjectRole; className?: string }) => {
  const config = PROJECT_ROLE[role];

  return (
    <Badge tone={config.tone} variant="outline" size="sm" className={className}>
      {config.label}
    </Badge>
  );
};

/**
 * LabelChip
 *
 * A project label. The colour comes from the label record itself (`color` is a
 * hex string in the API), so it is applied inline rather than from the palette —
 * these are user data, not design tokens. The tint is derived from that colour
 * at low alpha so a user-chosen red does not become an unreadable solid block.
 */
export const LabelChip = ({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) => {
  if (!color) {
    return (
      <Badge tone="neutral" size="sm" className={className}>
        {name}
      </Badge>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-sm border px-2 text-xs font-medium',
        className
      )}
      style={{
        // 14% tint of the label's own colour, with the full colour as the border.
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
        color: `color-mix(in srgb, ${color} 82%, var(--color-ink-900))`,
      }}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </span>
  );
};

export { TASK_STATUS, TASK_PRIORITY, PROJECT_STATUS, WORKSPACE_ROLE, PROJECT_ROLE };
