import type * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground transition-colors duration-200 outline-none",
        "placeholder:text-muted-foreground-foreground/60 focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
