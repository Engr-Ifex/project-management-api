import { AppProviders } from '@/app/providers';
import { AppRoutes } from '@/routes';

/*
 * App — the composition root, and nothing else.
 *
 * Two jobs, each in its own file:
 *
 *   - `app/providers.tsx`  what the whole app is wrapped in
 *   - `routes/index.tsx`   what URLs exist
 *
 * Keeping this file this small is the point. When it also held the route table
 * and fifteen lazy imports, a change to a provider meant scrolling past routing
 * to find it.
 */
export const App = () => (
  <AppProviders>
    <AppRoutes />
  </AppProviders>
);
