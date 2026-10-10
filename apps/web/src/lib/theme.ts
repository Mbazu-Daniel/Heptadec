import { useSyncExternalStore } from "react";

export type Theme = "system" | "dark" | "light";

const KEY = "heptadec-theme";

const ACCENT_KEY = "heptadec-accent";

export const DEFAULT_ACCENT = "#22d3ee";

function read(): Theme {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "dark" || raw === "light" ? raw : "system";
  } catch {
    return "system";
  }
}

let current: Theme = read();

let accent: string | null = readAccent();

const listeners = new Set<() => void>();

function readAccent(): string | null {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    return raw !== null && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolvedDark(theme: Theme): boolean {
  if (theme === "dark") {
    return true;
  }
  if (theme === "light") {
    return false;
  }
  return systemDark();
}

export function applyTheme(theme: Theme): void {
  current = theme;
  const dark = resolvedDark(theme);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem(KEY, theme);
  } catch {
  }
  listeners.forEach((listener) => listener());
}

export function initTheme(): void {
  applyTheme(current);
  applyAccent(accent);
}

export function applyAccent(color: string | null): void {
  accent =
    color !== null && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  const root = document.documentElement;
  if (accent === null) {
    root.style.removeProperty("--cyan");
    root.style.removeProperty("--accent-override");
  } else {
    root.style.setProperty("--cyan", accent);
    root.style.setProperty("--accent-override", accent);
  }
  try {
    if (accent === null) {
      localStorage.removeItem(ACCENT_KEY);
    } else {
      localStorage.setItem(ACCENT_KEY, accent);
    }
  } catch {
  }
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (current === "system") {
        applyTheme("system");
      }
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): Theme {
  return current;
}

export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, snapshot, snapshot);
  return [theme, applyTheme] as const;
}

function snapshotAccent(): string | null {
  return accent;
}

export function useAccent(): readonly [
  string | null,
  (color: string | null) => void,
] {
  const value = useSyncExternalStore(subscribe, snapshotAccent, snapshotAccent);
  return [value, applyAccent] as const;
}
