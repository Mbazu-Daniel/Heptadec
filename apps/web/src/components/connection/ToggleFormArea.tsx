import { useState, type ReactNode } from "react";

export function ToggleFormArea({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-fg"
      >
        <span className="material-symbols-outlined text-[16px]">
          {open ? "keyboard_arrow_down" : "keyboard_arrow_right"}
        </span>
        {title}
      </button>
      {open ? <div className="mt-3 grid gap-3">{children}</div> : null}
    </div>
  );
}
