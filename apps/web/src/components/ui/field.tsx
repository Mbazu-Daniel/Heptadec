import { Field } from "@base-ui-components/react/field";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function FieldGroup({
  className,
  ...props
}: React.ComponentProps<typeof Field.Root>) {
  return <Field.Root className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof Field.Label>) {
  return (
    <Field.Label
      className={cn("text-sm text-muted-foreground-foreground", className)}
      {...props}
    />
  );
}

export function FieldError({
  className,
  ...props
}: React.ComponentProps<typeof Field.Error>) {
  return (
    <Field.Error
      className={cn("text-sm text-destructive", className)}
      {...props}
    />
  );
}