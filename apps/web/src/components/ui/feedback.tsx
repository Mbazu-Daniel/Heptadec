import type * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({
  tone = "error",
  className,
  ...props
}: React.ComponentProps<"p"> & {
  tone?: "error" | "success";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md bg-muted px-3 py-2 text-xs",
        tone === "error" ? "text-red" : "text-green",
        className,
      )}
      {...props}
    />
  );
}

export function EmptyState({
  title,
  body,
  className,
}: {
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-8 text-center", className)}>
      <p className="text-sm text-fg">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  const frame = "size-8 shrink-0 rounded-full border border-border object-cover";
  if (image !== undefined && image !== null) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className={cn(frame, "bg-foreground/5", className)}
      />
    );
  }
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-8 shrink-0 place-items-center rounded-full border border-border bg-foreground/5 text-xs font-semibold text-fg", className)}
    >
      {initial}
    </span>
  );
}
