import { useState } from 'react';

import { cn } from '@/lib/cn';

/*
 * Avatar
 *
 * Falls back to initials when there is no image, and to a deterministic tint so
 * the same person always gets the same colour. A random colour per render is
 * the kind of detail that makes a product feel unstable without anyone being
 * able to say why.
 *
 * The image failing to load is handled explicitly: the API returns `avatar:
 * null` for most users, and a broken `<img>` would otherwise leave an empty box
 * rather than initials.
 */

const SIZES = {
  xs: { box: 'size-5', text: 'text-2xs', ring: 'ring-1' },
  sm: { box: 'size-6', text: 'text-2xs', ring: 'ring-1' },
  md: { box: 'size-7', text: 'text-xs', ring: 'ring-1' },
  lg: { box: 'size-9', text: 'text-sm', ring: 'ring-2' },
  xl: { box: 'size-14', text: 'text-xl', ring: 'ring-2' },
} as const;

export type AvatarSize = keyof typeof SIZES;

/* Six muted tints, all from the existing palette. No new hues. */
const TINTS = [
  'bg-accent-100 text-accent-700',
  'bg-success-100 text-success-700',
  'bg-warning-100 text-warning-700',
  'bg-caution-100 text-caution-700',
  'bg-danger-100 text-danger-700',
  'bg-ink-150 text-ink-700',
];

/** Stable hash → the same seed always picks the same tint. */
const tintFor = (seed: string) => {
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  return TINTS[Math.abs(hash) % TINTS.length] ?? TINTS[0];
};

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();

  return `${(parts[0] ?? '').charAt(0)}${(parts[parts.length - 1] ?? '').charAt(0)}`.toUpperCase();
};

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  /** Adds a white ring — for stacking, or on a coloured surface. */
  ring?: boolean;
  className?: string;
}

export const Avatar = ({ name, src, size = 'md', ring = false, className }: AvatarProps) => {
  const [failed, setFailed] = useState(false);
  const dimensions = SIZES[size];

  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'font-medium select-none',
        dimensions.box,
        dimensions.text,
        !showImage && tintFor(name),
        ring && cn('ring-surface', dimensions.ring),
        className
      )}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}

      {/* The name is the accessible label either way; the image is decorative. */}
      <span className="sr-only">{name}</span>
    </span>
  );
};

/**
 * AvatarGroup
 *
 * An overlapping stack with a `+N` overflow chip. Used wherever a project's
 * members are shown in a list — the alternative, one avatar per row, does not
 * fit in a table column.
 */
export const AvatarGroup = ({
  people,
  max = 4,
  size = 'sm',
  className,
}: {
  people: { name: string; src?: string | null }[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}) => {
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-1.5">
        {visible.map((person, index) => (
          <Avatar
            key={`${person.name}-${index}`}
            name={person.name}
            src={person.src}
            size={size}
            ring
          />
        ))}
      </div>

      {overflow > 0 && (
        <span className="ml-1.5 text-xs text-body-subtle" data-numeric>
          +{overflow}
        </span>
      )}
    </div>
  );
};

export { initialsOf };
