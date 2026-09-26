import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { Button } from './Button';
import { IconButton } from './Button';

/*
 * Modal
 *
 * Radix Dialog for the parts that are genuinely hard: focus trapped inside the
 * panel and restored to the trigger on close, `aria-modal`, background content
 * hidden from assistive technology, and Escape to dismiss. All of that is
 * invisible when it works and a serious accessibility failure when it is
 * missing.
 *
 * The overlay is a 40% ink wash with a slight blur, not a heavy black scrim —
 * the page behind should still be legible as context.
 *
 * Widths are capped and the body scrolls, so a long form never produces a
 * dialog taller than the viewport.
 */

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
} as const;

export const Modal = DialogPrimitive.Root;
export const ModalTrigger = DialogPrimitive.Trigger;
export const ModalClose = DialogPrimitive.Close;

export interface ModalContentProps {
  children: ReactNode;
  size?: keyof typeof SIZES;
  /** Hides the close button — only for a dialog that forces a choice. */
  hideClose?: boolean;
  className?: string;
}

export const ModalContent = ({
  children,
  size = 'md',
  hideClose,
  className,
}: ModalContentProps) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-[2px]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out'
      )}
    />

    <DialogPrimitive.Content
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
        'max-h-[calc(100dvh-4rem)] overflow-hidden flex flex-col',
        'rounded-xl border border-line bg-surface shadow-lg',
        SIZES[size],
        className
      )}
    >
      {children}

      {!hideClose && (
        <DialogPrimitive.Close asChild>
          <IconButton
            label="Close"
            size="sm"
            icon={<X aria-hidden />}
            className="absolute right-2.5 top-2.5"
          />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);

export const ModalHeader = ({
  title,
  description,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-1 border-b border-line-subtle px-5 py-4 pr-12', className)}>
    <DialogPrimitive.Title className="text-md font-semibold text-body">{title}</DialogPrimitive.Title>

    {description ? (
      <DialogPrimitive.Description className="text-xs text-body-muted">
        {description}
      </DialogPrimitive.Description>
    ) : (
      /*
       * Radix warns when a dialog has no description. An empty one satisfies the
       * requirement without adding a blank line to every dialog that has none.
       */
      <DialogPrimitive.Description className="sr-only" />
    )}
  </div>
);

export const ModalBody = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('flex-1 overflow-y-auto scrollbar-thin px-5 py-4', className)}>{children}</div>
);

export const ModalFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      'flex items-center justify-end gap-2 border-t border-line-subtle bg-ink-25 px-5 py-3',
      className
    )}
  >
    {children}
  </div>
);

/**
 * ConfirmDialog
 *
 * The confirmation step for anything destructive. Kept as its own component
 * because every call site needs the same shape — a plain question, the
 * consequence spelled out, and the destructive action named by its verb
 * ("Archive project", not "OK").
 *
 * `tone="danger"` styles the confirm button red. Use it for anything that
 * cannot be undone, and leave it neutral for reversible actions: if every
 * confirmation is red, none of them read as serious.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Names the action. "Archive project", not "Confirm". */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  loading?: boolean;
}

export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  loading,
}: ConfirmDialogProps) => (
  <Modal open={open} onOpenChange={onOpenChange}>
    <ModalContent size="sm">
      <ModalHeader title={title} description={description} />

      <ModalFooter>
        <DialogPrimitive.Close asChild>
          <Button variant="secondary" disabled={loading}>
            {cancelLabel}
          </Button>
        </DialogPrimitive.Close>

        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);
