import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { FullPageLoader, RequireAnonymous, RequireAuth } from '@/components/RequireAuth';
import { ToastProvider, TooltipProvider } from '@/components/ui';
import { AuthProvider } from '@/lib/auth/AuthProvider';

/*
 * App — the composition root.
 *
 * Provider order is load-bearing:
 *
 *   1. `BrowserRouter` first, because everything below it may navigate.
 *   2. `AuthProvider` next. It owns the session, and the 401 broadcast it
 *      subscribes to is what tears the session down from anywhere in the tree.
 *   3. `TooltipProvider` — one shared delay for every tooltip. Without it each
 *      tooltip re-waits on its own and moving along a row of icon buttons feels
 *      broken.
 *   4. `ToastProvider` last, so a toast fired while logging out still has a
 *      viewport to land in.
 *
 * Every route is lazily imported. In Phase 2 the design-system showcase was the
 * entire application; it is kept as a route, because it is still how a regression
 * in a shared primitive gets caught in one place rather than on whichever page
 * happens to use it.
 */

/* --------------------------------------------------------------- lazy routes */

const DesignSystemShowcase = lazy(() =>
  import('@/routes/DesignSystem').then((module) => ({ default: module.DesignSystemShowcase }))
);
const Login = lazy(() => import('@/routes/Login').then((module) => ({ default: module.Login })));
const Register = lazy(() =>
  import('@/routes/Register').then((module) => ({ default: module.Register }))
);
const AcceptInvitation = lazy(() =>
  import('@/routes/AcceptInvitation').then((module) => ({ default: module.AcceptInvitation }))
);
const WorkspaceList = lazy(() =>
  import('@/routes/WorkspaceList').then((module) => ({ default: module.WorkspaceList }))
);
const WorkspaceLayout = lazy(() =>
  import('@/routes/WorkspaceLayout').then((module) => ({ default: module.WorkspaceLayout }))
);
const Dashboard = lazy(() =>
  import('@/routes/Dashboard').then((module) => ({ default: module.Dashboard }))
);
const Projects = lazy(() =>
  import('@/routes/Projects').then((module) => ({ default: module.Projects }))
);
const ProjectLayout = lazy(() =>
  import('@/routes/ProjectLayout').then((module) => ({ default: module.ProjectLayout }))
);
const ProjectOverview = lazy(() =>
  import('@/routes/ProjectOverview').then((module) => ({ default: module.ProjectOverview }))
);
const TaskDetail = lazy(() =>
  import('@/routes/TaskDetail').then((module) => ({ default: module.TaskDetail }))
);
const Members = lazy(() =>
  import('@/routes/Members').then((module) => ({ default: module.Members }))
);
const Notifications = lazy(() =>
  import('@/routes/Notifications').then((module) => ({ default: module.Notifications }))
);
const Settings = lazy(() =>
  import('@/routes/Settings').then((module) => ({ default: module.Settings }))
);
const NotFound = lazy(() =>
  import('@/routes/NotFound').then((module) => ({ default: module.NotFound }))
);

/* ----------------------------------------------------------------------- app */

export const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <ToastProvider>
          <Suspense fallback={<FullPageLoader />}>
            <Routes>
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

              {/* Public: an invitee may not have an account yet. */}
              <Route path="/invitations/:token" element={<AcceptInvitation />} />

              {/* The design-system showcase. Not linked from the product nav. */}
              <Route path="/design" element={<DesignSystemShowcase />} />

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

              <Route path="/" element={<Navigate to="/workspaces" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
);
