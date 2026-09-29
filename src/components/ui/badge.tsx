import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'ui-badge',
  success: 'ui-badge ui-badge-success',
  warning: 'ui-badge ui-badge-warning',
  danger: 'ui-badge ui-badge-danger',
  info: 'ui-badge ui-badge-info',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn(variantClasses[variant], className)} {...props} />;
}
