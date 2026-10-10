import { useAccent, useTheme } from "./theme";

export interface IChartPalette {
  series: string[];
  label: string;
  grid: string;
}

const CYAN = "#22d3ee";

const GREEN = "#22ff99";

const BLUE = "#3b9eff";

const VIOLET = "#a78bfa";

const ORANGE = "#fa8200";

const RED = "#ff173f";

const LABEL = "#93a3b0";

const GRID = "#1b2430";

export function useChartPalette(): IChartPalette {
  useTheme();
  const [accent] = useAccent();

  const styles = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    series: [
      accent ?? value("--cyan", CYAN),
      value("--green", GREEN),
      value("--blue", BLUE),
      value("--violet", VIOLET),
      value("--orange", ORANGE),
      value("--red", RED),
    ],
    label: value("--muted-foreground", LABEL),
    grid: value("--border", GRID),
  };
}
