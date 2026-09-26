import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names, with later Tailwind utilities winning over earlier ones.
 *
 * Every component takes a `className` prop and merges it through here, so a
 * caller can override a default (`px-3` → `px-5`) without knowing the internals
 * or reaching for `!important`. Plain string concatenation would leave both
 * classes in place and let CSS source order decide, which is how component
 * libraries end up with overrides that only sometimes work.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
