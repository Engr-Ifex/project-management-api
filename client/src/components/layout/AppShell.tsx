import * as DialogPrimitive from '@radix-ui/react-dialog';
import { CaretUpDown, List, X } from '@phosphor-icons/react';
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { Avatar, IconButton } from '@/components/ui';

/*
 * AppShell
 *
 * The persistent frame every page mounts into: a fixed sidebar on desktop, a
 * slide-over drawer on mobile, and a content region that owns its own scrolling.
 *
 * Layout decisions worth stating:
 *
 * - **The page scrolls, not the shell.** The sidebar and topbar stay put, so
 *   the workspace switcher and the nav are reachable from anywhere in a long
 *   task list. This is the single biggest difference between a tool and a
 *   document.
 * - **`min-h-[100dvh]`, not `h-screen`.** On mobile Safari the viewport shrinks
 *   as the address bar appears; `100vh` leaves a strip of the page permanently
 *   unreachable behind it.
 * - **The sidebar is 240px, not 280px.** Every pixel here is taken from the
 *   table, which is where the work is.
 * - **Active nav is the accent, tinted.** One of the four places the accent is
 *   allowed to appear, and the reason it stays meaningful everywhere else.
 */

export interface NavItem {
  /** Route path. Compared against `currentPath` for the active state. */
  href: string;
  label: string;
  icon: ReactNode;
  /** A count badge — unread notifications, open tasks. */
  count?: number;
  /** Renders the item disabled with a reason in the title attribute. */
  disabledReason?: string;
}

export interface AppShellProps {
  navItems: NavItem[];
  currentPath: string;
  /** Called with the item's href. Routing is wired in a later phase. */
  onNavigate?: (href: string) => void;
  /** The workspace switcher, rendered as-is — wrap `WorkspaceSwitcher` in your own menu. */
  workspaceSlot?: ReactNode;
  /** The account menu slot. */
  accountSlot?: ReactNode;
  /** Topbar content: page title on the left, actions on the right. */
  topbar?: ReactNode;
  children: ReactNode;
}

const NavList = ({
  items,
  currentPath,
  onNavigate,
  onItemClick,
}: {
  items: NavItem[];
  currentPath: string;
  onNavigate?: (href: string) => void;
  onItemClick?: () => void;
}) => (
  <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
    {items.map((item) => {
      const active = item.href === currentPath;

      return (
        <button
          key={item.href}
          type="button"
          aria-current={active ? 'page' : undefined}
          disabled={Boolean(item.disabledReason)}
          title={item.disabledReason}
          onClick={() => {
            onNavigate?.(item.href);
            onItemClick?.();
          }}
          className={cn(
            'group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm',
            'transition-colors duration-[120ms] ease-standard',
            'disabled:cursor-not-allowed disabled:opacity-45',
            active
              ? 'bg-accent-50 font-medium text-accent-700'
              : 'text-body-muted hover:bg-surface-active hover:text-body',
            '[&_svg]:size-4 [&_svg]:shrink-0',
            active && '[&_svg]:text-accent-600'
          )}
        >
          {item.icon}
          <span className="flex-1 truncate text-left">{item.label}</span>

          {typeof item.count === 'number' && item.count > 0 && (
            <span
              className={cn(
                'rounded-xs px-1 text-2xs tabular-nums',
                active ? 'bg-accent-100 text-accent-700' : 'bg-ink-100 text-body-subtle'
              )}
              data-numeric
            >
              {item.count > 99 ? '99+' : item.count}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);

/** The workspace switcher trigger. Wrap it in a `DropdownMenuTrigger asChild` to add the menu. */
export const WorkspaceSwitcher = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }
>(function WorkspaceSwitcher({ children, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5',
        'text-left transition-colors duration-[120ms] ease-standard',
        'hover:border-line hover:bg-surface',
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-ink-900 text-2xs font-semibold text-body-inverse"
      >
        {typeof children === 'string' ? children.charAt(0).toUpperCase() : 'W'}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-body">
          {children ?? 'Select workspace'}
        </span>
      </span>

      <CaretUpDown aria-hidden className="size-3.5 shrink-0 text-body-subtle" />
    </button>
  );
});

export const AppShell = ({
  navItems,
  currentPath,
  onNavigate,
  workspaceSlot,
  accountSlot,
  topbar,
  children,
}: AppShellProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-canvas">
      {/* Skip link: the first tab stop, so keyboard users can bypass the nav. */}
      <a
        data-skip-link
        href="#main"
        className="rounded-md bg-surface px-3 py-2 text-sm shadow-md"
      >
        Skip to content
      </a>

      {/* ---- Desktop sidebar ---- */}
      <aside
        className={cn(
          'hidden lg:flex w-sidebar shrink-0 flex-col',
          'border-r border-line bg-surface'
        )}
      >
        <div className="flex h-topbar shrink-0 items-center px-2">
          {workspaceSlot ?? <WorkspaceSwitcher>Select workspace</WorkspaceSwitcher>}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
          <NavList items={navItems} currentPath={currentPath} onNavigate={onNavigate} />
        </div>

        {accountSlot && (
          <div className="shrink-0 border-t border-line-subtle p-2">{accountSlot}</div>
        )}
      </aside>

      {/* ---- Mobile drawer ---- */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink-950/40 lg:hidden" />

          <DialogPrimitive.Content
            className={cn(
              'fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col',
              'border-r border-line bg-surface shadow-lg lg:hidden'
            )}
          >
            <div className="flex h-topbar shrink-0 items-center justify-between gap-2 px-2 pr-3">
              <div className="min-w-0 flex-1">
                {workspaceSlot ?? <WorkspaceSwitcher>Select workspace</WorkspaceSwitcher>}
              </div>

              <DialogPrimitive.Close asChild>
                <IconButton label="Close navigation" size="sm" icon={<X aria-hidden />} />
              </DialogPrimitive.Close>
            </div>

            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only" />

            <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
              <NavList
                items={navItems}
                currentPath={currentPath}
                onNavigate={onNavigate}
                onItemClick={() => setMobileOpen(false)}
              />
            </div>

            {accountSlot && (
              <div className="shrink-0 border-t border-line-subtle p-2">{accountSlot}</div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* ---- Content column ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            'sticky top-0 z-30 flex h-topbar shrink-0 items-center gap-3',
            'border-b border-line bg-surface/85 px-4 backdrop-blur-sm'
          )}
        >
          {/* Mobile: the only way into the nav. */}
          <IconButton
            label="Open navigation"
            size="sm"
            className="lg:hidden"
            icon={<List aria-hidden />}
            onClick={() => setMobileOpen(true)}
          />

          <div className="flex min-w-0 flex-1 items-center gap-3">{topbar}</div>
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
};

/**
 * PageHeader — the title block at the top of a page's content.
 *
 * `text-xl` (20px) for the title, not `text-4xl`. A page title in an application
 * is a label for where you are, not a headline; oversized headings push the
 * actual content below the fold and make every screen feel like a landing page.
 */
export const PageHeader = ({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-3 border-b border-line px-4 py-4 lg:px-6', className)}>
    {breadcrumb && <div className="flex items-center gap-1.5 text-xs text-body-subtle">{breadcrumb}</div>}

    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate text-xl font-semibold text-body">{title}</h1>
        {description && <p className="text-xs text-body-muted">{description}</p>}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  </div>
);

/**
 * AccountMenuTrigger — the avatar + name row at the bottom of the sidebar.
 * Rendered as the trigger for a DropdownMenu supplied by the caller.
 */
export const AccountMenuTrigger = ({
  name,
  email,
  avatar,
}: {
  name: string;
  email: string;
  avatar?: string | null;
}) => (
  <button
    type="button"
    className={cn(
      'flex w-full items-center gap-2 rounded-md px-2 py-1.5',
      'text-left transition-colors duration-[120ms] ease-standard',
      'hover:bg-surface-active'
    )}
  >
    <Avatar name={name} src={avatar} size="sm" />

    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate text-sm font-medium text-body">{name}</span>
      <span className="truncate text-2xs text-body-subtle">{email}</span>
    </span>

    <CaretUpDown aria-hidden className="size-3.5 shrink-0 text-body-subtle" />
  </button>
);
