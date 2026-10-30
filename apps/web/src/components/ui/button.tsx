import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-secondary font-semibold whitespace-nowrap text-foreground shadow-[0_1px_3px_0_rgb(0_0_0/0.1),0_1px_2px_-1px_rgb(0_0_0/0.1)] transition-all duration-200 outline-none hover:bg-foreground hover:text-background hover:shadow-[0_0_20px_-4px_color-mix(in_srgb,var(--foreground)_35%,transparent)] focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-cyan text-on-accent hover:bg-cyan/85 hover:text-on-accent",
        secondary:
          "border-border bg-secondary text-foreground hover:bg-secondary/80 hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground shadow-none backdrop-blur-none hover:bg-transparent hover:text-foreground hover:shadow-none",
        social: "w-full border-border",
      },
      size: {
        default: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

interface IButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: IButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };