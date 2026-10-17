/*
 * The design system's shell surface — the subset reachable without signing in.
 *
 * ## Why this exists
 *
 * `./index` re-exports the whole library. Any module that imports from it pulls
 * in the barrel, and the barrel imports every component, so **importing one
 * primitive pulls in all of them**. That is invisible until you look at the
 * bundle, and it was costing real time:
 *
 * The sign-in shell needs `Button`, `Input`, `PasswordInput`, `Card`, `Spinner`
 * and `ErrorState`. It was also getting `Select`, `Checkbox`, `Table`, `Tabs`,
 * `Modal`, `DropdownMenu`, `Pagination`, `StatusBadge`, `Avatar`, `Tooltip` and
 * `Toast` — because those are re-exported from `./index`, which is in the
 * entry's import graph. The whole lot was `modulepreload`ed on every route.
 *
 * Importing from this file instead keeps the barrel out of the unauthenticated
 * path, so only these components (and their dependencies) are fetched before the
 * sign-in screen can render.
 *
 * ## The rule
 *
 * Anything reachable from the unauthenticated shell — the providers, the route
 * guards, the error boundary, `AuthShell`, and the four auth screens — imports
 * from **here**. Everything else keeps importing from `@/components/ui`.
 *
 * Adding a component to this file adds it to every page load. Add it because the
 * shell genuinely renders it, not for convenience: if a shell component needs
 * something heavier, that is worth knowing about, and the bundle report in
 * `dev/bundle-report.mjs` is how you check.
 */

export { Button, IconButton, buttonStyles } from './Button';
export type { ButtonProps, IconButtonProps } from './Button';

export { Input, Textarea, controlBase, invalidStyles } from './Input';
export type { InputProps, TextareaProps } from './Input';

export { PasswordInput } from './PasswordInput';
export type { PasswordInputProps } from './PasswordInput';

export { FieldShell, useFieldControl } from './Field';
export type { FieldShellProps, FieldIds } from './Field';

export { Card, CardHeader, CardBody, CardFooter, StatTile } from './Card';
export type { CardProps } from './Card';

export { Skeleton, SkeletonText, SkeletonList, Spinner, LoadingOverlay } from './Skeleton';

export { EmptyState, ErrorState } from './States';
export type { EmptyStateProps, ErrorStateProps } from './States';
