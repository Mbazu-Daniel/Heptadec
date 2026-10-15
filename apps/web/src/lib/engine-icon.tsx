import {
  siClickhouse,
  siMariadb,
  siMongodb,
  siMysql,
  siPostgresql,
  siRedis,
  siSqlite,
  siTurso,
} from "simple-icons";
import { cn } from "@/lib/utils";

interface IBrandMark {
  title: string;
  hex: string;
  paths: readonly string[];
  viewBox?: string;
  transform?: string;
}

function fromSimpleIcons(icon: {
  title: string;
  hex: string;
  path: string;
}): IBrandMark {
  return { title: icon.title, hex: icon.hex, paths: [icon.path] };
}

const BRAND_MARKS: Record<string, IBrandMark> = {
  postgres: fromSimpleIcons(siPostgresql),
  mysql: fromSimpleIcons(siMysql),
  mariadb: fromSimpleIcons(siMariadb),
  redis: fromSimpleIcons(siRedis),
  sqlite: fromSimpleIcons(siSqlite),
  clickhouse: fromSimpleIcons(siClickhouse),
  libsql: fromSimpleIcons(siTurso),
  mongodb: fromSimpleIcons(siMongodb),
  quickwit: {
    title: "Quickwit",
    hex: "ff0026",
    viewBox: "0 0 512 512",
    transform: "translate(143 208.025)",
    paths: [
      "M-30.5-148.6 130.2-31.8 171.8-89 11.1-205.8z",
      "M-124.7 29.3 67.2-22.1 48.9-90.4-143-39z",
      "M-45.6 214 35.2 32.5-29.4 3.8l-80.8 181.4z",
      "M147.4 269.6 57.2 92.7l-63 32.1 90.2 177z",
      "m311.5 153.2-194.4-41.3-14.7 69.1 194.3 41.3z",
      "m324.5-47.6-154.4 125 44.5 54.9L369 7.3z",
      "M172.1 17.9h70.7v-198.7h-70.7z",
    ],
  },
};

export function EngineIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const mark = BRAND_MARKS[name];

  if (mark === undefined) {
    return (
      <span
        aria-hidden="true"
        className={cn("material-symbols-outlined", className)}
      >
        database
      </span>
    );
  }

  return (
    <svg
      role="img"
      aria-label={mark.title}
      viewBox={mark.viewBox ?? "0 0 24 24"}
      className={cn("shrink-0", className)}
    >
      <g transform={mark.transform}>
        {mark.paths.map((path) => (
          <path key={path} d={path} fill={`#${mark.hex}`} />
        ))}
      </g>
    </svg>
  );
}
