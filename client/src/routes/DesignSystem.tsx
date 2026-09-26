import { useState } from 'react';
import {
  Archive,
  ArrowClockwise,
  Bell,
  CheckCircle,
  Copy,
  DotsThree,
  Folder,
  Gear,
  House,
  PencilSimple,
  Plus,
  Trash,
  Users,
} from '@phosphor-icons/react';

import {
  AccountMenuTrigger,
  AppShell,
  PageHeader,
  type NavItem,
} from '@/components/layout/AppShell';
import {
  Avatar,
  AvatarGroup,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  FieldShell,
  IconButton,
  Input,
  LabelChip,
  Modal,
  ModalBody,
  ModalClose,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  ProjectRoleBadge,
  ProjectStatusBadge,
  SegmentedControl,
  Select,
  SkeletonList,
  SkeletonText,
  Spinner,
  StatTile,
  StatusDot,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TableMessage,
  TableSkeletonRows,
  TableWrapper,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TaskPriorityBadge,
  TaskStatusBadge,
  Textarea,
  Tooltip,
  ToastProvider,
  WorkspaceRoleBadge,
  useToast,
} from '@/components/ui';
import { cn } from '@/lib/cn';

/*
 * Design-system showcase.
 *
 * Not an application page. It renders every token and every primitive so the
 * system can be reviewed, and so a regression in a shared component is visible
 * in one place rather than on whichever screen happens to use it. It stays in
 * the repository for that reason.
 */

const Section = ({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="scroll-mt-20 border-b border-line px-4 py-8 lg:px-6">
    <div className="mb-5 flex flex-col gap-1">
      <h2 className="text-lg font-semibold text-body">{title}</h2>
      {description && <p className="max-w-[65ch] text-xs text-body-muted">{description}</p>}
    </div>
    {children}
  </section>
);

const Swatch = ({ name, value, className }: { name: string; value: string; className: string }) => (
  <div className="flex flex-col gap-1.5">
    <div className={cn('h-9 rounded-md border border-line', className)} />
    <div className="flex flex-col">
      <span className="text-xs font-medium text-body">{name}</span>
      <span className="font-mono text-2xs text-body-subtle">{value}</span>
    </div>
  </div>
);

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: <House /> },
  { href: '/projects', label: 'Projects', icon: <Folder /> },
  { href: '/tasks', label: 'My tasks', icon: <CheckCircle />, count: 12 },
  { href: '/members', label: 'Members', icon: <Users /> },
  { href: '/notifications', label: 'Notifications', icon: <Bell />, count: 3 },
  { href: '/settings', label: 'Settings', icon: <Gear /> },
];

const ShowcaseContent = () => {
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState<boolean | 'indeterminate'>(true);
  const [status, setStatus] = useState('in_progress');

  const members = [
    { name: 'Amara Okonkwo', src: null },
    { name: 'Tomas Lindqvist', src: null },
    { name: 'Priya Raman', src: null },
    { name: 'Jonah Feld', src: null },
    { name: 'Wei Chen', src: null },
  ];

  return (
    <div className="mx-auto max-w-content">
      <PageHeader
        title="Design system"
        description="Every token and primitive in one place. This page is a reference, not an application screen."
        actions={
          <>
            <Button variant="secondary" size="sm" iconLeft={<ArrowClockwise />}>
              Reset
            </Button>
            <Button variant="primary" size="sm" iconLeft={<Plus />}>
              New project
            </Button>
          </>
        }
      />

      {/* ---------------------------------------------------------------- */}
      <Section
        id="colour"
        title="Colour"
        description="One neutral ramp, one accent, four semantic hues. Colour carries meaning in this product, so the accent is reserved for interactive state and never used decoratively."
      >
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">Ink — the neutral ramp</p>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7 lg:grid-cols-14">
              {(
                [
                  ['25', 'bg-ink-25'],
                  ['50', 'bg-ink-50'],
                  ['100', 'bg-ink-100'],
                  ['150', 'bg-ink-150'],
                  ['200', 'bg-ink-200'],
                  ['300', 'bg-ink-300'],
                  ['400', 'bg-ink-400'],
                  ['500', 'bg-ink-500'],
                  ['600', 'bg-ink-600'],
                  ['700', 'bg-ink-700'],
                  ['800', 'bg-ink-800'],
                  ['900', 'bg-ink-900'],
                  ['950', 'bg-ink-950'],
                ] as const
              ).map(([step, className]) => (
                <Swatch key={step} name={step} value={`ink-${step}`} className={className} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">
              Accent — focus rings, selected nav, links, in-progress only
            </p>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-7 lg:grid-cols-9">
              {(
                [
                  ['50', 'bg-accent-50'],
                  ['100', 'bg-accent-100'],
                  ['200', 'bg-accent-200'],
                  ['300', 'bg-accent-300'],
                  ['400', 'bg-accent-400'],
                  ['500', 'bg-accent-500'],
                  ['600', 'bg-accent-600'],
                  ['700', 'bg-accent-700'],
                  ['800', 'bg-accent-800'],
                ] as const
              ).map(([step, className]) => (
                <Swatch key={step} name={step} value={`accent-${step}`} className={className} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">
              Semantic — meaning, not decoration
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              <Swatch name="success-500" value="completed" className="bg-success-500" />
              <Swatch name="warning-500" value="in review" className="bg-warning-500" />
              <Swatch name="caution-500" value="high priority" className="bg-caution-500" />
              <Swatch name="danger-500" value="urgent / destructive" className="bg-danger-500" />
              <Swatch name="accent-500" value="in progress" className="bg-accent-500" />
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">Surfaces and text</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Swatch name="canvas" value="page" className="bg-canvas" />
              <Swatch name="surface" value="panels" className="bg-surface" />
              <Swatch name="sunken" value="wells" className="bg-surface-sunken" />
              <Swatch name="line" value="border" className="bg-line" />
              <Swatch name="line-strong" value="input border" className="bg-line-strong" />
              <Swatch name="body" value="primary text" className="bg-body" />
              <Swatch name="body-muted" value="secondary" className="bg-body-muted" />
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="typography"
        title="Typography"
        description="Geist for interface text, Geist Mono for ids and figures. Base size is 14px — this is a dense application, and the heading scale stops at 30px."
      >
        <div className="flex flex-col gap-4">
          {(
            [
              ['text-3xl', 'Page hero', '30px / semibold'],
              ['text-2xl', 'Section title', '24px / semibold'],
              ['text-xl', 'Page title', '20px / semibold'],
              ['text-lg', 'Card title', '16px / semibold'],
              ['text-md', 'Dialog title', '15px / semibold'],
              ['text-base', 'Body', '14px / regular — the default'],
              ['text-sm', 'Dense body, buttons, inputs', '13px / regular'],
              ['text-xs', 'Meta, timestamps, hints', '12px / regular'],
              ['text-2xs', 'Table headers, overlines', '11px / medium, uppercase'],
            ] as const
          ).map(([size, label, spec]) => (
            <div key={size} className="flex flex-wrap items-baseline gap-4">
              <span className={cn(size, 'font-semibold text-body')}>{label}</span>
              <span className="font-mono text-2xs text-body-subtle">
                {size} · {spec}
              </span>
            </div>
          ))}

          <div className="mt-2 flex flex-col gap-2 border-t border-line-subtle pt-4">
            <p className="max-w-[65ch] text-base leading-relaxed text-body">
              Body copy is capped at roughly 65 characters. Beyond that the eye loses the start of
              the next line, and a description field in a task panel becomes work to read rather
              than work to skim.
            </p>
            <p className="font-mono text-xs text-body-muted">
              6aaf7cbd7ec8624e2979081d · 340 · 12–18 of 340
            </p>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="spacing"
        title="Spacing, radius, elevation"
        description="A 4px base step. Radii stop at 10px for panels — only pills go fully round. Shadows are warm-tinted and low-opacity; elevation communicates stacking order, not decoration."
      >
        <div className="flex flex-col gap-8">
          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">Spacing scale</p>
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4, 6, 8, 12, 16].map((step) => (
                <div key={step} className="flex items-center gap-3">
                  <span className="w-12 font-mono text-2xs text-body-subtle">{step}</span>
                  <div className="h-2 rounded-xs bg-accent-300" style={{ width: `${step * 4}px` }} />
                  <span className="font-mono text-2xs text-body-subtle">{step * 4}px</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">Radius</p>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['xs', 'rounded-xs', '4px · badges'],
                  ['sm', 'rounded-sm', '6px · small buttons'],
                  ['md', 'rounded-md', '8px · buttons, inputs'],
                  ['lg', 'rounded-lg', '10px · cards, menus'],
                  ['xl', 'rounded-xl', '14px · modals'],
                  ['full', 'rounded-full', 'pills, avatars'],
                ] as const
              ).map(([name, className, spec]) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div className={cn('size-14 border border-line-strong bg-surface', className)} />
                  <span className="text-xs font-medium text-body">{name}</span>
                  <span className="font-mono text-2xs text-body-subtle">{spec}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs font-medium text-body-muted">Elevation</p>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['xs', 'shadow-xs', 'resting card'],
                  ['sm', 'shadow-sm', 'raised card'],
                  ['md', 'shadow-md', 'menu, popover'],
                  ['lg', 'shadow-lg', 'modal, toast'],
                ] as const
              ).map(([name, className, spec]) => (
                <div key={name} className="flex flex-col items-center gap-1.5">
                  <div className={cn('size-14 rounded-lg border border-line bg-surface', className)} />
                  <span className="text-xs font-medium text-body">{name}</span>
                  <span className="font-mono text-2xs text-body-subtle">{spec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="buttons"
        title="Buttons"
        description="Primary is graphite, not the accent. In this product colour is information — teal means in progress, red means urgent — so a coloured primary button would compete with the data beside it."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="link">Link button</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="primary" loading>
              Saving
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="sm" iconLeft={<Plus />}>
              Small
            </Button>
            <Button variant="primary" size="md" iconLeft={<Plus />}>
              Medium
            </Button>
            <Button variant="primary" size="lg" iconLeft={<Plus />}>
              Large
            </Button>
            <Button variant="secondary" size="md" iconRight={<Archive />}>
              With trailing icon
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <IconButton label="Edit" icon={<PencilSimple />} />
            <IconButton label="Copy" icon={<Copy />} variant="secondary" />
            <IconButton label="Delete" icon={<Trash />} variant="ghost" />
            <IconButton label="More actions" icon={<DotsThree weight="bold" />} />
            <Tooltip content="This one has a tooltip">
              <IconButton label="Archived items" icon={<Archive />} variant="secondary" />
            </Tooltip>
          </div>

          <div className="max-w-sm">
            <Button variant="primary" block iconLeft={<Plus />}>
              Full-width primary
            </Button>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="forms"
        title="Form controls"
        description="Label above, hint or error below, an 8px stack. The error replaces the hint rather than stacking under it, and every control is wired with aria-describedby and aria-invalid."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Input label="Project name" placeholder="Payments v2" required />

            <Input
              label="Email"
              type="email"
              defaultValue="not-an-email"
              error="Enter a valid email address"
              required
            />

            <Input
              label="Search"
              placeholder="Search tasks…"
              hint="Matches title and description"
            />

            <Input
              label="Size"
              inputSize="sm"
              placeholder="Small control"
            />

            <Textarea
              label="Description"
              placeholder="What is this project for?"
              hint="Markdown is not supported."
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-5">
            <Select
              label="Status"
              value={status}
              onValueChange={setStatus}
              options={[
                { value: 'todo', label: 'To do', adornment: <StatusDot tone="neutral" /> },
                { value: 'in_progress', label: 'In progress', adornment: <StatusDot tone="accent" /> },
                { value: 'in_review', label: 'In review', adornment: <StatusDot tone="warning" /> },
                { value: 'completed', label: 'Completed', adornment: <StatusDot tone="success" /> },
              ]}
              hint="Radix listbox — arrow keys, type-ahead, focus returns on close"
            />

            <Select
              label="Assignee"
              placeholder="Unassigned"
              options={[
                { value: 'amara', label: 'Amara Okonkwo' },
                { value: 'tomas', label: 'Tomas Lindqvist' },
                { value: 'priya', label: 'Priya Raman' },
              ]}
            />

            <Select
              label="Disabled"
              disabled
              options={[{ value: 'x', label: 'Cannot change' }]}
            />

            <div className="flex flex-col gap-3">
              <Checkbox
                id="cb-1"
                label="Email notifications"
                description="Assigned tasks, mentions and due-date reminders."
                checked={checked === true}
                onCheckedChange={setChecked}
              />

              <Checkbox id="cb-2" label="Marketing emails" checked={false} onCheckedChange={() => {}} />

              <Checkbox
                id="cb-3"
                label="Indeterminate"
                checked="indeterminate"
                onCheckedChange={() => {}}
              />

              <Checkbox id="cb-4" label="Disabled" disabled checked={false} onCheckedChange={() => {}} />
            </div>

            {/* FieldShell directly, for a control that is not one of the built-ins. */}
            <FieldShell label="Custom control" controlId="custom" hint="Compose your own.">
              <div className="flex h-8 items-center rounded-md border border-line-strong bg-surface-sunken px-2.5 font-mono text-xs text-body-muted">
                6aaf7cbd7ec8624e2979081d
              </div>
            </FieldShell>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="badges"
        title="Badges, avatars, status"
        description="Status colours are mapped once, here, so a task cannot be amber on the board and teal in the list. Avatars fall back to initials with a tint derived from the name."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="caution">Caution</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="accent" variant="outline">
              Outline
            </Badge>
            <Badge tone="neutral" size="sm">
              Small
            </Badge>
            <Badge tone="accent" shape="pill">
              Pill
            </Badge>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-body-muted">Task status</p>
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status="todo" />
              <TaskStatusBadge status="in_progress" />
              <TaskStatusBadge status="in_review" />
              <TaskStatusBadge status="completed" />
              <TaskStatusBadge status="cancelled" />
              <span className="mx-2 h-4 w-px bg-line" />
              <TaskStatusBadge status="in_progress" variant="dot" />
              <TaskStatusBadge status="completed" variant="dot" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-body-muted">Priority and project status</p>
            <div className="flex flex-wrap items-center gap-2">
              <TaskPriorityBadge priority="low" />
              <TaskPriorityBadge priority="medium" />
              <TaskPriorityBadge priority="high" />
              <TaskPriorityBadge priority="urgent" />
              <span className="mx-2 h-4 w-px bg-line" />
              <ProjectStatusBadge status="planning" />
              <ProjectStatusBadge status="active" />
              <ProjectStatusBadge status="on_hold" />
              <ProjectStatusBadge status="completed" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-body-muted">Roles and labels</p>
            <div className="flex flex-wrap items-center gap-2">
              <WorkspaceRoleBadge role="owner" />
              <WorkspaceRoleBadge role="admin" />
              <WorkspaceRoleBadge role="member" />
              <span className="mx-2 h-4 w-px bg-line" />
              <ProjectRoleBadge role="viewer" />
              <span className="mx-2 h-4 w-px bg-line" />
              <LabelChip name="Bug" color="#b4493f" />
              <LabelChip name="Design" color="#348579" />
              <LabelChip name="Blocked" color="#a67c2e" />
              <LabelChip name="No colour" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((size) => (
                <Avatar key={size} name="Amara Okonkwo" size={size} />
              ))}
            </div>
            <AvatarGroup people={members} />
            <AvatarGroup people={members} max={2} size="md" />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="cards"
        title="Cards and stats"
        description="A bordered surface with a hairline shadow. For a list of similar items prefer dividers over a card each — forty bordered boxes is noise, forty rows separated by a line is a table."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader
              title="Sprint 24"
              description="Ends in 6 days"
              action={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton label="Sprint actions" size="sm" icon={<DotsThree weight="bold" />} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem icon={<PencilSimple />}>Rename</DropdownMenuItem>
                    <DropdownMenuItem icon={<Copy />}>Duplicate</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<Archive />}>Archive</DropdownMenuItem>
                    <DropdownMenuItem icon={<Trash />} destructive>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            />
            <CardBody>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-body-muted">
                  Body content. Padding is 16px, the same as the header and footer, so the card
                  reads as one surface rather than three stacked bands.
                </p>
                <div className="flex flex-wrap gap-2">
                  <TaskStatusBadge status="in_progress" />
                  <TaskPriorityBadge priority="high" />
                </div>
              </div>
            </CardBody>
            <CardFooter>
              <span className="text-xs text-body-subtle">12 of 20 tasks done</span>
              <Button size="sm" variant="secondary">
                Open
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader title="Workspace summary" />
            <div className="divide-y divide-line-subtle">
              <StatTile label="Projects" value="8" delta="+2 this month" tone="success" />
              <StatTile label="Open tasks" value="142" delta="18 overdue" tone="danger" />
              <StatTile label="Assigned to me" value="12" hint="Across 4 projects" />
            </div>
          </Card>

          <Card>
            <CardHeader title="Loading state" description="Skeletons match the shape of the content" />
            <CardBody>
              <SkeletonText lines={3} />
            </CardBody>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="tables"
        title="Tables"
        description="Rows separated by hairlines rather than a box around every cell. Headers recede; figures are tabular and right-aligned so a column does not jitter."
      >
        <div className="flex flex-col gap-6">
          <Card>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH className="w-8">
                      <Checkbox checked={false} onCheckedChange={() => {}} />
                    </TH>
                    <TH sortDirection="asc" onSort={() => {}}>
                      Task
                    </TH>
                    <TH>Status</TH>
                    <TH>Priority</TH>
                    <TH>Assignee</TH>
                    <TH numeric sortDirection={false} onSort={() => {}}>
                      Estimate
                    </TH>
                    <TH className="w-10" />
                  </TR>
                </THead>
                <TBody>
                  {(
                    [
                      ['Reconcile ledger exports', 'in_progress', 'high', 'Amara Okonkwo', 240],
                      ['Retry policy for webhooks', 'in_review', 'urgent', 'Tomas Lindqvist', 90],
                      ['Empty state copy pass', 'todo', 'low', 'Priya Raman', 45],
                      ['Audit trail retention', 'completed', 'medium', 'Jonah Feld', 120],
                      ['SSO domain verification', 'cancelled', 'medium', 'Wei Chen', 60],
                    ] as const
                  ).map(([title, taskStatus, priority, assignee, estimate]) => (
                    <TR key={title} interactive className="group/row">
                      <TD>
                        <Checkbox checked={false} onCheckedChange={() => {}} />
                      </TD>
                      <TD primary>{title}</TD>
                      <TD>
                        <TaskStatusBadge status={taskStatus} variant="dot" />
                      </TD>
                      <TD>
                        <TaskPriorityBadge priority={priority} variant="dot" />
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <Avatar name={assignee} size="xs" />
                          <span className="truncate">{assignee}</span>
                        </span>
                      </TD>
                      <TD numeric>{estimate}m</TD>
                      <TD>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              label="Row actions"
                              size="sm"
                              icon={<DotsThree weight="bold" />}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem icon={<PencilSimple />}>Edit</DropdownMenuItem>
                            <DropdownMenuItem icon={<Archive />}>Archive</DropdownMenuItem>
                            <DropdownMenuItem icon={<Trash />} destructive>
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>

            <Pagination
              page={page}
              limit={limit}
              total={340}
              totalPages={17}
              hasPrevPage={page > 1}
              hasNextPage={page < 17}
              onPageChange={setPage}
              onLimitChange={setLimit}
              className="border-t border-line-subtle"
            />
          </Card>

          <Card>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Loading</TH>
                    <TH>Empty</TH>
                    <TH numeric>Error</TH>
                  </TR>
                </THead>
                <TBody>
                  <TableSkeletonRows rows={2} columns={3} />
                </TBody>
              </Table>
            </TableWrapper>
          </Card>

          <Card>
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Task</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  <TableMessage colSpan={2}>
                    <EmptyState
                      variant="no-results"
                      title="No tasks match these filters"
                      description="Try removing the priority filter, or search for a different term."
                      action={
                        <Button size="sm" variant="secondary">
                          Clear filters
                        </Button>
                      }
                    />
                  </TableMessage>
                </TBody>
              </Table>
            </TableWrapper>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="navigation"
        title="Tabs and segmented controls"
        description="Tabs change what you are looking at; a segmented control changes how the same thing is displayed. They look different because they do different jobs."
      >
        <div className="flex flex-col gap-6">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="tasks" count={42}>
                Tasks
              </TabsTrigger>
              <TabsTrigger value="activity" count={128}>
                Activity
              </TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Archived
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="pt-4">
              <p className="text-sm text-body-muted">
                Panel content. Arrow keys move between tabs, and the active tab is marked with an
                underline rather than a filled pill — a filled block would compete with the primary
                button on a dense screen.
              </p>
            </TabsContent>
            <TabsContent value="tasks" className="pt-4">
              <SkeletonList rows={2} />
            </TabsContent>
            <TabsContent value="activity" className="pt-4">
              <p className="text-sm text-body-muted">Activity feed.</p>
            </TabsContent>
            <TabsContent value="files" className="pt-4">
              <p className="text-sm text-body-muted">Attachments.</p>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              value={view}
              onValueChange={setView}
              options={[
                { value: 'list', label: 'List' },
                { value: 'board', label: 'Board' },
              ]}
            />

            <Tooltip content="Tooltips are for names of icon-only controls and truncated values — never for information the user needs.">
              <Button variant="secondary" size="sm">
                Hover me
              </Button>
            </Tooltip>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="overlays"
        title="Dialogs, menus, toasts"
        description="Radix supplies the focus trap, the Escape handling and the ARIA wiring. The visual layer is ours."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>

          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Destructive confirmation
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" iconRight={<DotsThree weight="bold" />}>
                Open menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              <DropdownMenuLabel>Task</DropdownMenuLabel>
              <DropdownMenuItem icon={<PencilSimple />} shortcut="⌘E">
                Edit task
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Copy />}>Duplicate</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Archive />}>Archive</DropdownMenuItem>
              <DropdownMenuItem icon={<Trash />} destructive>
                Delete task
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="secondary"
            onClick={() => {
              toast.success('Task archived', 'It can be restored from the archive.');
              toast.error('Could not save changes', 'The server returned 409 Conflict.');
            }}
          >
            Fire toasts
          </Button>
        </div>

        <Modal open={modalOpen} onOpenChange={setModalOpen}>
          <ModalContent size="md">
            <ModalHeader
              title="Edit task"
              description="Focus is trapped inside this panel and returns to the trigger when it closes."
            />
            <ModalBody>
              <div className="flex flex-col gap-5">
                <Input label="Title" defaultValue="Reconcile ledger exports" />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Select
                    label="Status"
                    value={status}
                    onValueChange={setStatus}
                    options={[
                      { value: 'todo', label: 'To do' },
                      { value: 'in_progress', label: 'In progress' },
                      { value: 'completed', label: 'Completed' },
                    ]}
                  />
                  <Input label="Estimate" defaultValue="240" suffix="min" />
                </div>
                <Textarea label="Description" defaultValue="Match the export against the ledger." />
              </div>
            </ModalBody>
            <ModalFooter>
              <ModalClose asChild>
                <Button variant="secondary">Cancel</Button>
              </ModalClose>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                Save changes
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          tone="danger"
          title="Delete this task?"
          description="This cannot be undone. The task and its subtasks will be permanently removed."
          confirmLabel="Delete task"
          onConfirm={() => setConfirmOpen(false)}
        />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        id="states"
        title="Empty, loading, error"
        description="An empty list and a filtered-to-nothing list are different situations and get different words. Showing 'No tasks yet' when the truth is 'none match your filters' tells the user their data is gone."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Genuinely empty" />
            <EmptyState
              title="No projects yet"
              description="Create your first project to start tracking work."
              action={
                <Button size="sm" variant="primary" iconLeft={<Plus />}>
                  New project
                </Button>
              }
            />
          </Card>

          <Card>
            <CardHeader title="No results" />
            <EmptyState
              variant="no-results"
              title="No tasks match these filters"
              description="Try a different search term or clear the filters."
              action={
                <Button size="sm" variant="secondary">
                  Clear filters
                </Button>
              }
            />
          </Card>

          <Card>
            <CardHeader title="Error" />
            <ErrorState
              title="Could not load tasks"
              description="The request timed out. Check your connection and try again."
              onRetry={() => {}}
            />
          </Card>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="List loading" />
            <SkeletonList rows={3} />
          </Card>

          <Card>
            <CardHeader title="Inline loading" />
            <CardBody>
              <div className="flex items-center gap-4">
                <Spinner />
                <Spinner size="lg" />
                <span className="text-sm text-body-muted">Fetching notifications…</span>
              </div>
            </CardBody>
          </Card>
        </div>
      </Section>

      <div className="px-4 py-8 lg:px-6">
        <p className="text-xs text-body-subtle">
          End of the design system. Application pages are built in a later phase.
        </p>
      </div>
    </div>
  );
};

export const DesignSystemShowcase = () => (
  <ToastProvider>
    <AppShell
      navItems={NAV_ITEMS}
      currentPath="/design"
      workspaceSlot="Northwind"
      accountSlot={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AccountMenuTrigger
              name="Amara Okonkwo"
              email="amara@northwind.example"
              avatar={null}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>amara@northwind.example</DropdownMenuLabel>
            <DropdownMenuItem icon={<Gear />}>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      topbar={
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-body">Design system</span>
          <Badge tone="neutral" size="sm">
            Internal
          </Badge>
        </div>
      }
    >
      <ShowcaseContent />
    </AppShell>
  </ToastProvider>
);
