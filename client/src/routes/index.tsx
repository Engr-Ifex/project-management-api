import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { FullPageLoader, RequireAnonymous, RequireAuth } from '@/routes/guards';

/*
 * The route table.
 *
 * Kept separate from the provider composition in `app/App.tsx` so that
 * "what URLs exist" is one file, and "what the app is wrapped in" is another.
 * A single file holding both is where route definitions start getting edited by
 * accident while debugging a provider.
 *
 * Route shape, and why:
 *
 *   /                          public marketing homepage
 *   /login, /register          public, and *redirect away* when already signed in
 *   /forgot-password           public, same guard — a signed-in user changes
 *                              their password in Settings instead
 *   /reset-password            public and deliberately NOT behind
 *                              RequireAnonymous: it is opened from an email on
 *                              whatever device is to hand, and a signed-in user
 *                              may still be completing a reset they started
 *                              elsewhere
 *   /invitations/:token        public on purpose — an invitee usually has no
 *                              account yet, so gating it behind login would ask
 *                              them to sign in before they can see what for
 *   /design                    the design-system showcase; not in the product nav
 *   /workspaces                the user's workspaces (the post-login landing)
 *   /workspaces/:workspaceId   the workspace shell, with the sections nested
 *     projects/:projectId      a project, with the task detail nested under it
 *   *                          not found
 *
 * Every route is lazily imported, so the initial bundle is the shell and the
 * login screen only. Each screen is its own chunk.
 */

/* --------------------------------------------------------------- lazy routes */

const MarketingHomepage = lazy(() =>
  import('@/pages/MarketingHomepage').then((module) => ({ default: module.MarketingHomepage }))
);
const DesignSystemShowcase = lazy(() =>
  import('@/pages/DesignSystem').then((module) => ({ default: module.DesignSystemShowcase }))
);
const Login = lazy(() => import('@/pages/Login').then((module) => ({ default: module.Login })));
const Register = lazy(() =>
  import('@/pages/Register').then((module) => ({ default: module.Register }))
);
const AcceptInvitation = lazy(() =>
  import('@/pages/AcceptInvitation').then((module) => ({ default: module.AcceptInvitation }))
);
const ForgotPassword = lazy(() =>
  import('@/pages/ForgotPassword').then((module) => ({ default: module.ForgotPassword }))
);
const ResetPassword = lazy(() =>
  import('@/pages/ResetPassword').then((module) => ({ default: module.ResetPassword }))
);
const WorkspaceList = lazy(() =>
  import('@/pages/WorkspaceList').then((module) => ({ default: module.WorkspaceList }))
);
const WorkspaceLayout = lazy(() =>
  import('@/layouts/WorkspaceLayout').then((module) => ({ default: module.WorkspaceLayout }))
);
const Dashboard = lazy(() =>
  import('@/pages/Dashboard').then((module) => ({ default: module.Dashboard }))
);
const Projects = lazy(() =>
  import('@/pages/Projects').then((module) => ({ default: module.Projects }))
);
const ProjectLayout = lazy(() =>
  import('@/layouts/ProjectLayout').then((module) => ({ default: module.ProjectLayout }))
);
const ProjectOverview = lazy(() =>
  import('@/pages/ProjectOverview').then((module) => ({ default: module.ProjectOverview }))
);
const TaskDetail = lazy(() =>
  import('@/pages/TaskDetail').then((module) => ({ default: module.TaskDetail }))
);
const Members = lazy(() =>
  import('@/pages/Members').then((module) => ({ default: module.Members }))
);
const Notifications = lazy(() =>
  import('@/pages/Notifications').then((module) => ({ default: module.Notifications }))
);
const Settings = lazy(() =>
  import('@/pages/Settings').then((module) => ({ default: module.Settings }))
);
const NotFound = lazy(() =>
  import('@/pages/NotFound').then((module) => ({ default: module.NotFound }))
);

/* ------------------------------------------------------------------ the tree */

export const AppRoutes = () => (
  <Suspense fallback={<FullPageLoader />}>
    <Routes>
      {/* ---- public ---- */}
      <Route
        path="/login"
        element={
          <RequireAnonymous>
            <Login />
          </RequireAnonymous>
        }
      />
      <Route
        path="/register"
        element={
          <RequireAnonymous>
            <Register />
          </RequireAnonymous>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RequireAnonymous>
            <ForgotPassword />
          </RequireAnonymous>
        }
      />
      {/*
        Unguarded on purpose — see the route notes above. This is reached from an
        email link, and the session state on the device that opens it is not
        something the product can assume.
      */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invitations/:token" element={<AcceptInvitation />} />
      <Route path="/design" element={<DesignSystemShowcase />} />

      {/* ---- authenticated ---- */}
      <Route
        path="/workspaces"
        element={
          <RequireAuth>
            <WorkspaceList />
          </RequireAuth>
        }
      />

      <Route
        path="/workspaces/:workspaceId"
        element={
          <RequireAuth>
            <WorkspaceLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<ProjectOverview />} />
          <Route path="tasks/:taskId" element={<TaskDetail />} />
        </Route>
        <Route path="members" element={<Members />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/" element={<MarketingHomepage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </Suspense>
);
