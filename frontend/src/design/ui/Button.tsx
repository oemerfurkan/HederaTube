import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "chain" | "secondary" | "outline" | "ghost" | "destructive" | "link" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center whitespace-nowrap rounded-pill font-medium transition-all duration-[180ms] ease-ht select-none " +
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed active:scale-[0.97]";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg border-0 hover:brightness-[1.08] disabled:bg-secondary disabled:text-muted-fg",
  /** Money buttons are Chain, never Signal. */
  chain: "bg-chain text-chain-on border-0 hover:brightness-[1.08] focus-visible:ring-chain/40 disabled:bg-secondary disabled:text-muted-fg",
  secondary: "bg-secondary text-secondary-fg border-0 hover:bg-surface-3 disabled:text-muted-fg",
  outline: "border border-border bg-transparent hover:border-primary hover:text-primary disabled:text-muted-fg",
  ghost: "bg-transparent text-muted-fg hover:bg-surface-2 hover:text-fg",
  destructive: "bg-destructive text-white border-0 hover:brightness-[1.08]",
  link: "bg-transparent underline underline-offset-[3px] px-0 h-auto text-body",
  icon: "border border-border bg-transparent w-10 h-10 p-0 hover:bg-surface-2",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-4 text-[13px] gap-1.5",
  md: "h-10 px-[22px] text-body gap-2",
  lg: "h-12 px-7 text-[16px] gap-2.5",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, className, children, disabled, ...rest },
  ref,
) {
  const isIcon = variant === "icon";
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], !isIcon && variant !== "link" && sizes[size], loading && "cursor-progress", className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  );
});
