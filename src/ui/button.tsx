import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 border-2 font-medium tracking-tight " +
  "transition-[background-color,border-color,color,box-shadow] duration-[var(--motion-fast)] ease-technical " +
  "disabled:cursor-not-allowed disabled:opacity-45 select-none";

const variants: Record<Variant, string> = {
  primary:
    "border-accent bg-accent text-white hover:bg-accent-hover hover:border-accent-hover active:bg-accent-pressed",
  secondary: "border-border-strong bg-transparent text-text-primary hover:border-text-primary hover:bg-hover-surface",
  ghost: "border-transparent bg-transparent text-text-secondary hover:text-text-primary hover:bg-hover-surface",
  danger: "border-danger bg-transparent text-danger hover:bg-danger hover:text-bg",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
