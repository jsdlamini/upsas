import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'ui-btn ui-btn-primary',
  outline: 'ui-btn ui-btn-outline',
  ghost: 'ui-btn ui-btn-ghost',
  destructive: 'ui-btn ui-btn-destructive',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'ui-btn-sm',
  md: '',
  lg: 'ui-btn-lg',
  icon: 'ui-btn-icon',
};

export function buttonVariants(options?: { variant?: ButtonVariant; size?: ButtonSize }): string {
  const { variant = 'primary', size = 'md' } = options ?? {};
  return cn(variantClasses[variant], sizeClasses[size]);
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
