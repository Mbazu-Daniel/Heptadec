import type { IMe } from "@heptadec/api/auth-contracts";
import { Button } from "./ui/button";

interface IDashboardProps {
  me: IMe;
  onSignOut: () => Promise<void>;
}

const STATS = [
  { label: "Sources", value: "0", tint: "text-muted-foreground" },
  { label: "Queries", value: "0", tint: "text-green" },
  { label: "Latency", value: "n/a", tint: "text-cyan" },
  { label: "Scope", value: "Personal", tint: "text-muted-foreground" },
];

export function Dashboard({ me, onSignOut }: IDashboardProps) {
  return (
    <div className="relative min-h-screen">
      <div className="spot" />

      <header className="sticky top-0 z-10 border-b border-border bg-background/60 backdrop-blur-[12px]">
        <div className="mx-auto flex h-[58px] max-w-[1280px] items-center gap-4 px-6">
          <span className="grad font-display text-lg tracking-[-0.05em]">
            Heptadec
          </span>
          <span className="tag ml-auto">{me.user.email}</span>
          <Button variant="ghost" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-6 py-24">
        <div className="halo pt-10">
          <h1 className="grad font-serif text-[58px] leading-none tracking-[-0.01em]">
            Signed in.
          </h1>
          <p className="mt-4 max-w-[640px] text-lg text-muted-foreground">
            Welcome, {me.user.name || me.user.email}. Your workspace is empty.
          </p>
        </div>

        <section className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="card px-6 py-5">
              <p className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
                {stat.label}
              </p>
              <p className={`mt-2 text-[38px] leading-none ${stat.tint}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </section>

        <section className="card mt-6 px-8 py-10">
          <h2 className="font-display text-xl tracking-[-0.05em]">
            Data sources
          </h2>
          <p className="mt-3 max-w-[640px] text-muted-foreground">
            We removed the data sources during development. We will add them
            again for organizations. Then each organization can use
            Postgres, Redis, and Quickwit.
          </p>
        </section>
      </main>
    </div>
  );
}