import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle, Info, WarningCircle, X, XCircle } from '@phosphor-icons/react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { IconButton } from './Button';

/*
 * Toast
 *
 * Transient confirmation for an action that has already happened. Not for
 * validation errors (those belong inline, next to the field) and not for
 * anything the user must act on (that is a dialog).
 *
 * Radix supplies the `aria-live` region, the swipe-to-dismiss gesture and the
 * pause-on-hover behaviour — all of which are easy to skip and all of which
 * matter. A toast that disappears while being read, or that a screen reader
 * never announces, is worse than no toast.
 *
 * Toasts stack in one place (bottom-right on desktop, bottom on mobile) so they
 * never cover the primary action, and they pause on hover so a long message can
 * actually be read.
 */

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface ToastRecord {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Milliseconds. Errors default to longer because they carry more to read. */
  duration?: number;
}

interface ToastContextValue {
  toast: (toast: Omit<ToastRecord, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: ReactNode; accent: string }> = {
  success: {
    icon: <CheckCircle aria-hidden weight="fill" className="size-4 text-success-500" />,
    accent: 'border-l-success-500',
  },
  error: {
    icon: <XCircle aria-hidden weight="fill" className="size-4 text-danger-500" />,
    accent: 'border-l-danger-500',
  },
  warning: {
    icon: <WarningCircle aria-hidden weight="fill" className="size-4 text-warning-500" />,
    accent: 'border-l-warning-500',
  },
  info: {
    icon: <Info aria-hidden weight="fill" className="size-4 text-accent-500" />,
    accent: 'border-l-accent-500',
  },
};

let nextId = 1;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const toast = useCallback((input: Omit<ToastRecord, 'id'>) => {
    setToasts((current) => [...current, { ...input, id: nextId++ }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      warning: (title, description) => toast({ tone: 'warning', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast]
  );

  const dismiss = (id: number) => setToasts((current) => current.filter((item) => item.id !== id));

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}

        {toasts.map((item) => {
          const tone = TONE_STYLES[item.tone];

          return (
            <ToastPrimitive.Root
              key={item.id}
              // Errors stay longer: they usually carry something to read.
              duration={item.duration ?? (item.tone === 'error' ? 7000 : 5000)}
              onOpenChange={(open) => {
                if (!open) dismiss(item.id);
              }}
              className={cn(
                'group pointer-events-auto relative flex w-full items-start gap-2.5',
                'rounded-lg border border-line border-l-2 bg-surface p-3 pr-9 shadow-lg',
                'data-[state=open]:animate-in data-[state=closed]:animate-out',
                'data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
                tone.accent
              )}
            >
              <span className="mt-px shrink-0">{tone.icon}</span>

              <div className="flex min-w-0 flex-col gap-0.5">
                <ToastPrimitive.Title className="text-sm font-medium text-body">
                  {item.title}
                </ToastPrimitive.Title>

                {item.description && (
                  <ToastPrimitive.Description className="text-xs text-body-muted">
                    {item.description}
                  </ToastPrimitive.Description>
                )}
              </div>

              <ToastPrimitive.Close asChild>
                <IconButton
                  label="Dismiss"
                  size="sm"
                  icon={<X aria-hidden />}
                  className="absolute right-1.5 top-1.5 size-6"
                />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport
          className={cn(
            'fixed z-[60] flex max-h-[100dvh] w-full flex-col gap-2 p-4',
            'bottom-0 right-0 sm:max-w-sm'
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }

  return context;
};
