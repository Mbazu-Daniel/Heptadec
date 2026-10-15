import { Input as BaseInput } from "@base-ui-components/react/input";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <BaseInput
      className={cn(
        "h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors duration-200 outline-none",
        "placeholder:text-muted-foreground-foreground/60 focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}