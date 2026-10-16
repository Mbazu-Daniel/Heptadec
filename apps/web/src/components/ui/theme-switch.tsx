import {
  IconDeviceDesktop,
  IconMoon,
  IconRefresh,
  IconSun,
} from "@tabler/icons-react";
import { DEFAULT_ACCENT, useAccent, useTheme } from "../../lib/theme";

const PRESETS = ["#fa8200", "#a78bfa", "#34d399", "#60a5fa"];

export function ThemeSwitch({
  showAccent = true,
  stretchModes = false,
  stacked = false,
}: {
  showAccent?: boolean;
  stretchModes?: boolean;
  stacked?: boolean;
}) {
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const stretch = stretchModes ? " flex-1" : "";

  const modeButtons = (
    [
      { id: "system", icon: IconDeviceDesktop },
      { id: "light", icon: IconSun },
      { id: "dark", icon: IconMoon },
    ] as const
  ).map((entry) => (
    <button
      key={entry.id}
      type="button"
      title={entry.id[0]!.toUpperCase() + entry.id.slice(1)}
      aria-pressed={theme === entry.id}
      onClick={() => setTheme(entry.id)}
      className={
        theme === entry.id
          ? `grid size-8 place-items-center rounded-lg bg-cyan/15 text-fg${stretch}`
          : `grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-fg${stretch}`
      }
    >
      <entry.icon size={15} />
    </button>
  ));

  if (stacked && showAccent) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">{modeButtons}</div>
        <div className="flex items-center gap-1">{accentRow(accent, setAccent)}</div>
      </div>
    );
  }

  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-1">
      {modeButtons}
      {showAccent ? (
        <>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          {accentRow(accent, setAccent)}
        </>
      ) : null}
    </div>
  );
}

function accentRow(
  accent: string | null,
  setAccent: (value: string | null) => void,
) {
  return (
    <>
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          title={`Accent ${preset}`}
          aria-pressed={accent === preset}
          onClick={() => setAccent(preset)}
          className={
            accent === preset
              ? "grid size-8 place-items-center rounded-lg ring-1 ring-cyan"
              : "grid size-8 place-items-center rounded-lg transition-colors hover:bg-foreground/5"
          }
        >
          <span
            aria-hidden="true"
            className="size-4 rounded-full"
            style={{ backgroundColor: preset }}
          />
        </button>
      ))}
      <label
        title="Custom accent color"
        className="relative grid size-8 cursor-pointer place-items-center rounded-lg transition-colors hover:bg-foreground/5"
      >
        <span className="sr-only">Custom accent color</span>
        <input
          type="color"
          value={accent ?? DEFAULT_ACCENT}
          onChange={(event) => setAccent(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Custom accent color"
        />
        <span
          aria-hidden="true"
          className="grid size-4 place-items-center rounded-full border border-dashed border-muted-foreground text-[11px] leading-none text-muted-foreground"
          style={
            accent !== null && !PRESETS.includes(accent)
              ? {
                  backgroundColor: accent,
                  borderStyle: "solid",
                  borderColor: accent,
                  color: "#000",
                }
              : undefined
          }
        >
          +
        </span>
      </label>
      {accent !== null ? (
        <button
          type="button"
          title="Reset accent color"
          onClick={() => setAccent(null)}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-fg"
        >
          <IconRefresh size={14} />
        </button>
      ) : null}
    </>
  );
}
