import { Check, Copy } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Button, Input } from '@/components/ui';

/**
 * A read-only value with a copy button.
 *
 * App-level rather than part of the design system: it is not a general-purpose
 * primitive, it exists for exactly one job — handing over an invitation link,
 * which is the only way an invitee can join because this API sends no email.
 *
 * The clipboard API needs a secure context and permission, so a failure is
 * handled rather than assumed away: the field is still selectable and readable,
 * and the button reports that copying did not work instead of silently claiming
 * success.
 */
export const CopyField = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        label={label}
        readOnly
        value={value}
        onFocus={(event) => event.target.select()}
        containerClassName="w-full"
        suffix={
          <Button
            variant="ghost"
            size="sm"
            iconLeft={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        }
      />

      {failed && (
        <p className="text-2xs text-warning-700">
          Could not copy automatically — select the link above and copy it manually.
        </p>
      )}
    </div>
  );
};
