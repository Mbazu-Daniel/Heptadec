import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui-components/react/menu";
import { cn } from "@/lib/utils";

function MenuRoot({ ...props }: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

function MenuTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={cn(
        "flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-fg data-[popup-open]:bg-foreground/5 data-[popup-open]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

function MenuPortal(
  props: React.ComponentProps<typeof MenuPrimitive.Portal>,
) {
  return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />;
}

function MenuPositioner({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Positioner>) {
  return (
    <MenuPrimitive.Positioner
      data-slot="menu-positioner"
      className={cn("z-50", className)}
      {...props}
    />
  );
}

function MenuPopup({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup>) {
  return (
    <MenuPrimitive.Popup
      data-slot="menu-popup"
      className={cn(
        "min-w-40 origin-(--transform-origin) rounded-md border border-border bg-card p-1 text-xs text-fg shadow-md",
        className,
      )}
      {...props}
    />
  );
}

function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none data-[highlighted]:bg-foreground/5 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  MenuRoot,
  MenuTrigger,
  MenuPortal,
  MenuPositioner,
  MenuPopup,
  MenuItem,
  MenuSeparator,
};
