import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Folders, Kanban, ListChecks, Users } from '@phosphor-icons/react';

import { Button } from '@/components/ui/shell';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useDocumentTitle } from '@/lib/hooks';

const Scene3D = lazy(() =>
  import('@/components/marketing/Scene3D').then((m) => ({ default: m.Scene3D }))
);

/* ------------------------------------------------------------------ nav */

const MarketingNav = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-shadow duration-200 ${scrolled ? 'shadow-sm' : ''}`}
      style={{ backgroundColor: 'rgba(248,247,245,0.92)', backdropFilter: 'blur(8px)' }}
    >
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-md bg-ink-950 text-xs font-semibold text-body-inverse"
          >
            PX
          </span>
          <span className="text-sm font-semibold text-body">PROJEX</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <a href="#features" className="text-sm text-body-muted hover:text-body">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-body-muted hover:text-body">
            How it works
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button variant="ghost" size="sm" onClick={() => navigate('/workspaces')}>
              Go to app
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                Log in
              </Button>
              <Button variant="primary" size="sm" onClick={() => navigate('/register')}>
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

/* ------------------------------------------------------------------ hero */

const Hero = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const [sceneVisible, setSceneVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSceneVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative overflow-hidden px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20 md:pt-20 md:pb-28 lg:px-8"
    >
      <div className="mx-auto max-w-[1400px]">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-semibold tracking-tight text-body sm:text-4xl md:text-[2.75rem] md:leading-[1.15]">
              Project management that stays out of your way
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-body-muted md:text-lg">
              Plan, track, and ship work together in workspaces built for clarity. No clutter, no
              noise — just the tools your team needs to move from idea to delivery.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Button
                  variant="primary"
                  size="lg"
                  iconRight={<ArrowRight aria-hidden />}
                  onClick={() => navigate('/workspaces')}
                >
                  Go to your workspaces
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    size="lg"
                    iconRight={<ArrowRight aria-hidden />}
                    onClick={() => navigate('/register')}
                  >
                    Get started free
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    See how it works
                  </Button>
                </>
              )}
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-body-subtle">No credit card required. Free to use.</p>
            )}
          </div>

          <div className="relative">
            {sceneVisible && (
              <Suspense
                fallback={
                  <div className="mx-auto flex h-[320px] w-full max-w-lg items-center justify-center rounded-xl border border-line bg-surface shadow-md sm:h-[380px] md:h-[420px]">
                    <span className="text-sm text-body-muted">Loading preview…</span>
                  </div>
                }
              >
                <Scene3D />
              </Suspense>
            )}
            {!sceneVisible && (
              <div className="mx-auto h-[320px] w-full max-w-lg rounded-xl border border-line bg-surface shadow-md sm:h-[380px] md:h-[420px]" />
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ features */

const FEATURES = [
  {
    icon: <Folders aria-hidden className="size-5" />,
    title: 'Workspaces',
    description:
      'Organize teams and projects in dedicated workspaces. Each workspace is a self-contained environment with its own members, projects, and settings.',
  },
  {
    icon: <Kanban aria-hidden className="size-5" />,
    title: 'Project tracking',
    description:
      'Track progress with status labels, deadlines, and color coding. See what is planned, active, on hold, or completed at a glance.',
  },
  {
    icon: <ListChecks aria-hidden className="size-5" />,
    title: 'Task management',
    description:
      'Assign work, set priorities, break tasks into subtasks, and discuss details in comments. Everything lives where it belongs.',
  },
  {
    icon: <Users aria-hidden className="size-5" />,
    title: 'Team collaboration',
    description:
      'Invite members by email, assign workspace and project roles, and stay in the loop with a unified notification feed.',
  },
];

const Features = () => (
  <section id="features" className="px-4 py-16 sm:px-6 sm:py-20 md:py-28 lg:px-8">
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-10 flex flex-col gap-2 md:mb-14">
        <h2 className="text-2xl font-semibold tracking-tight text-body sm:text-3xl">
          Everything you need to ship work
        </h2>
        <p className="max-w-2xl text-base text-body-muted">
          PROJEX covers the full project lifecycle without the bloat. These are the capabilities
          that teams use every day.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 shadow-xs transition-shadow duration-150 hover:shadow-md"
          >
            <div className="flex size-9 items-center justify-center rounded-md bg-ink-100 text-ink-700">
              {f.icon}
            </div>
            <h3 className="text-sm font-semibold text-body">{f.title}</h3>
            <p className="text-sm leading-relaxed text-body-muted">{f.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ workflow */

const STEPS = [
  {
    number: '01',
    title: 'Plan',
    description:
      'Create a workspace for your team, then add projects with clear names, descriptions, and deadlines. Set the direction before the work begins.',
  },
  {
    number: '02',
    title: 'Track',
    description:
      'Add tasks, assign owners, set priorities, and monitor progress on your personal dashboard. See overdue items, completion rates, and recent activity.',
  },
  {
    number: '03',
    title: 'Ship',
    description:
      'Move projects to completion with full visibility. Archive finished work without losing history, and restore anything you need later.',
  },
];

const Workflow = () => (
  <section id="how-it-works" className="bg-ink-25 px-4 py-16 sm:px-6 sm:py-20 md:py-28 lg:px-8">
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-10 flex flex-col gap-2 md:mb-14">
        <h2 className="text-2xl font-semibold tracking-tight text-body sm:text-3xl">
          From plan to ship in three steps
        </h2>
        <p className="max-w-2xl text-base text-body-muted">
          PROJEX is designed around a simple workflow that mirrors how teams actually work.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.number} className="flex flex-col gap-4">
            <span className="text-2xs font-bold tracking-widest text-body-subtle">
              STEP {step.number}
            </span>
            <h3 className="text-lg font-semibold text-body">{step.title}</h3>
            <p className="text-sm leading-relaxed text-body-muted">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ showcase */

const Showcase = () => (
  <section className="px-4 py-16 sm:px-6 sm:py-20 md:py-28 lg:px-8">
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-10 flex flex-col gap-2 md:mb-14">
        <h2 className="text-2xl font-semibold tracking-tight text-body sm:text-3xl">
          A dashboard that tells you what matters
        </h2>
        <p className="max-w-2xl text-base text-body-muted">
          Your personal workspace dashboard shows assigned tasks, project progress, and recent
          activity — so you know where to focus next.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
        {/* Stylised dashboard preview built with plain markup */}
        <div className="flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-line px-4 py-3 lg:px-6">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-body">Acme Corp</span>
              <span className="text-2xs text-body-muted">Your work across this workspace</span>
            </div>
            <div className="hidden gap-2 sm:flex">
              <span className="h-7 w-20 rounded-sm bg-ink-100" />
              <span className="h-7 w-24 rounded-sm bg-ink-900" />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-px bg-line-subtle lg:grid-cols-4">
            {[
              { label: 'Assigned to you', value: '12' },
              { label: 'Completed', value: '8', tone: 'success' as const },
              { label: 'Overdue', value: '1', tone: 'danger' as const },
              { label: 'Active projects', value: '5' },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface p-4">
                <p className="text-2xs text-body-muted">{stat.label}</p>
                <p
                  className={`mt-1 text-xl font-semibold ${
                    stat.tone === 'success'
                      ? 'text-success-600'
                      : stat.tone === 'danger'
                        ? 'text-danger-600'
                        : 'text-body'
                  }`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Panels */}
          <div className="grid grid-cols-1 gap-px bg-line-subtle lg:grid-cols-[1fr_18rem]">
            <div className="bg-surface p-4 lg:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-body">Projects</span>
                <span className="text-2xs text-body-muted">5 active</span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { name: 'Website redesign', color: '#348579', status: 'In progress' },
                  { name: 'Q4 marketing plan', color: '#a67c2e', status: 'Planning' },
                  { name: 'API v2 migration', color: '#4a8a5c', status: 'Completed' },
                ].map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 rounded-md border border-line-subtle px-3 py-2.5"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-body">{p.name}</span>
                    <span className="shrink-0 rounded-sm bg-ink-100 px-1.5 py-0.5 text-2xs text-body-muted">
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface p-4 lg:p-5">
              <span className="text-sm font-semibold text-body">Your work</span>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-body-muted">Completion</span>
                  <span className="text-sm font-semibold text-body">67%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-success-500" style={{ width: '67%' }} />
                </div>
                <p className="text-2xs text-body-subtle">8 of 12 complete</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

/* ------------------------------------------------------------------ CTA */

const FinalCTA = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <section className="bg-ink-950 px-4 py-16 sm:px-6 sm:py-20 md:py-28 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-body-inverse sm:text-3xl">
          Start shipping work today
        </h2>
        <p className="max-w-lg text-base text-ink-400">
          Join teams using PROJEX to plan, track, and deliver projects with clarity.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {isAuthenticated ? (
            <Button
              variant="primary"
              size="lg"
              iconRight={<ArrowRight aria-hidden />}
              onClick={() => navigate('/workspaces')}
            >
              Go to your workspaces
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                size="lg"
                iconRight={<ArrowRight aria-hidden />}
                onClick={() => navigate('/register')}
              >
                Get started free
              </Button>
              <Button variant="secondary" size="lg" onClick={() => navigate('/login')}>
                Sign in
              </Button>
            </>
          )}
        </div>
        {!isAuthenticated && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {['No credit card required', 'Free to use', 'Cancel anytime'].map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-2xs text-ink-400">
                <CheckCircle aria-hidden className="size-3.5 text-success-500" />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ footer */

const Footer = () => (
  <footer className="border-t border-line bg-canvas px-4 py-10 sm:px-6 lg:px-8">
    <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-4 sm:flex-row sm:justify-between">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex size-6 items-center justify-center rounded-sm bg-ink-950 text-2xs font-semibold text-body-inverse"
        >
          PX
        </span>
        <span className="text-sm font-medium text-body">PROJEX</span>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-4">
        <Link to="/login" className="text-xs text-body-muted hover:text-body">
          Sign in
        </Link>
        <Link to="/register" className="text-xs text-body-muted hover:text-body">
          Create account
        </Link>
      </nav>
      <p className="text-2xs text-body-subtle">&copy; {new Date().getFullYear()} PROJEX</p>
    </div>
  </footer>
);

/* ------------------------------------------------------------------ page */

export const MarketingHomepage = () => {
  useDocumentTitle('Project management for teams');

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <MarketingNav />
      <Hero />
      <Features />
      <Workflow />
      <Showcase />
      <FinalCTA />
      <Footer />
    </div>
  );
};
