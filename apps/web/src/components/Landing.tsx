import { Button } from "./ui/button";
import { LiveNow } from "./LiveNow";
import { QueryResult } from "./QueryResult";

interface ILandingProps {
  onGetStarted: () => void;
}

const STEPS = [
  {
    title: "Make an account",
    body: "An email address and a password. We read your name from the address. You have one form less to fill in.",
  },
  {
    title: "Connect a database",
    body: "Postgres, Redis, or Quickwit. The server holds the credentials. A browser never receives them.",
  },
  {
    title: "Ask in SQL",
    body: "Write the query and read the rows. The server returns each answer only to the account that asked for it.",
  },
];

export function Landing({ onGetStarted }: ILandingProps) {
  return (
    <div className="relative min-h-screen">
      <div className="spot" />

      <header className="sticky top-0 z-10 border-b border-border bg-background/60 backdrop-blur-[12px]">
        <div className="mx-auto flex h-[58px] max-w-[1280px] items-center px-6">
          <span className="grad font-display text-lg tracking-[-0.05em]">
            Heptadec
          </span>
          <Button className="ml-auto" onClick={onGetStarted}>
            Get started
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1280px] gap-16 px-6 pt-24 pb-32 lg:grid-cols-2 lg:gap-24 lg:pt-32">
        <div className="flex flex-col justify-center">
          <span className="mb-8 w-fit rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground">
            Private beta
          </span>

          <h1 className="grad font-serif text-[58px] leading-none tracking-[-0.03em] sm:text-[76px] lg:text-[96px]">
            Query <span className="accent">anything.</span>
          </h1>

          <p className="mt-6 max-w-[640px] text-lg text-muted-foreground">
            Point Heptadec at your databases and ask real questions. It signs,
            scopes, and audits each query. It never gives anyone a{" "}
            <span className="accent">write key</span>.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button size="lg" onClick={onGetStarted}>
              Get started
            </Button>
            <Button size="lg" variant="ghost" onClick={onGetStarted}>
              Documentation
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center lg:justify-end">
          <QueryResult />
        </div>
      </section>

      <section className="halo mx-auto max-w-[1280px] px-6 pt-16">
        <div className="max-w-[640px]">
          <h2 className="grad font-display text-[56px] leading-[1.2] tracking-[-0.05em]">
            Three <span className="accent">steps.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            You do not migrate a database. You do not change a schema. You do not
            provision a warehouse.
          </p>
        </div>

        <ol className="mt-16 grid gap-8 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="card px-6 py-8">
              <span className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-xl tracking-[-0.05em]">
                {step.title}
              </h3>
              <p className="mt-3 text-[15px] text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <LiveNow />

      <section className="mx-auto max-w-[1280px] px-6 pt-40 pb-40 text-center">
        <h2 className="grad font-serif text-[58px] leading-none tracking-[-0.03em] sm:text-[76px]">
          Start <span className="accent">asking.</span>
        </h2>
        <Button size="lg" className="mt-10" onClick={onGetStarted}>
          Get started
        </Button>
      </section>
    </div>
  );
}