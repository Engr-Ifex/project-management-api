import type { ReactNode } from 'react';

import { Card, CardBody } from '@/components/ui';

/**
 * The frame for the two unauthenticated screens.
 *
 * Centred and narrow. There is no marketing panel beside the form: this is a
 * tool people are trying to get into, and a hero image next to a login box is
 * decoration that costs the user attention. The brand mark is the same shape as
 * the favicon so the tab and the page agree.
 */
export const AuthShell = ({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) => (
  <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-md bg-ink-950 text-xs font-semibold text-body-inverse"
      >
        PM
      </span>
      <span className="text-sm font-medium text-body">Project Management</span>
    </div>

    <Card className="w-full max-w-sm">
      <CardBody className="flex flex-col gap-5 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-body">{title}</h1>
          {description && <p className="text-xs text-body-muted">{description}</p>}
        </div>

        {children}
      </CardBody>
    </Card>

    {footer && <div className="text-xs text-body-muted">{footer}</div>}
  </div>
);
