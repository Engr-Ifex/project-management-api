import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/ui';
import { useDocumentTitle } from '@/lib/hooks';

/**
 * 404.
 *
 * Note what this page does *not* do: explain why. The API returns 404 where it
 * means "you cannot see this" as well as where it means "this does not exist" —
 * a project in another workspace, another user's notification — because a 403
 * would confirm the resource is real. Inventing a distinction here would leak
 * exactly what the API is careful not to.
 */
export const NotFound = () => {
  useDocumentTitle('Not found');

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
      <EmptyState
        title="This page does not exist"
        description="The link may be out of date, or it may point at something you no longer have access to."
        action={
          <Link to="/workspaces" className="text-sm font-medium text-accent-600 hover:text-accent-700">
            Back to your workspaces
          </Link>
        }
      />
    </div>
  );
};
