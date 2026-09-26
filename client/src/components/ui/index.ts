/*
 * The design system's public surface.
 *
 * Pages import from `@/components/ui` and nothing else — never from a component
 * file directly. That keeps the import path stable when an internal file is
 * split or renamed, and it makes the system's size visible in one place.
 */

export { Button, IconButton, buttonStyles } from './Button';
export type { ButtonProps, IconButtonProps } from './Button';

export { Input, Textarea, controlBase, invalidStyles } from './Input';
export type { InputProps, TextareaProps } from './Input';

export { FieldShell, useFieldControl } from './Field';
export type { FieldShellProps, FieldIds } from './Field';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';

export { Badge, StatusDot, badgeStyles } from './Badge';
export type { BadgeProps } from './Badge';

export { Avatar, AvatarGroup, initialsOf } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

export { Card, CardHeader, CardBody, CardFooter, StatTile } from './Card';
export type { CardProps } from './Card';

export {
  TableWrapper,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TableMessage,
  TableSkeletonRows,
} from './Table';
export type { THProps, TDProps } from './Table';

export { Tabs, TabsList, TabsTrigger, TabsContent, SegmentedControl } from './Tabs';

export { Tooltip, TooltipProvider } from './Tooltip';
export type { TooltipProps } from './Tooltip';

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './DropdownMenu';

export {
  Modal,
  ModalTrigger,
  ModalClose,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ConfirmDialog,
} from './Modal';
export type { ModalContentProps, ConfirmDialogProps } from './Modal';

export { ToastProvider, useToast } from './Toast';

export { Skeleton, SkeletonText, SkeletonList, Spinner, LoadingOverlay } from './Skeleton';

export { EmptyState, ErrorState } from './States';
export type { EmptyStateProps, ErrorStateProps } from './States';

export { Pagination } from './Pagination';
export type { PaginationProps } from './Pagination';

export {
  TaskStatusBadge,
  TaskPriorityBadge,
  ProjectStatusBadge,
  WorkspaceRoleBadge,
  ProjectRoleBadge,
  LabelChip,
  TASK_STATUS,
  TASK_PRIORITY,
  PROJECT_STATUS,
  WORKSPACE_ROLE,
  PROJECT_ROLE,
} from './StatusBadge';
export type {
  TaskStatus,
  TaskPriority,
  ProjectStatus,
  WorkspaceRole,
  ProjectRole,
} from './StatusBadge';
