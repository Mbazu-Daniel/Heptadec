const LIVE = [
  "Email and password accounts, with Google and GitHub when credentials are set",
  "Passwords hashed with Argon2id, never stored in the clear",
  "Sessions are HTTP-only cookies; signing out drops the token",
  "Your name is read off your email address, so there is nothing to type",
];

const NEXT = [
  "Connect a Postgres, Redis, or Quickwit database to your account",
  "Run read-only SQL and read the rows back",
  "Share a saved query with the rest of your organization",
];

const SNIPPET = `curl -X POST http://localhost:8787/api/auth/sign-up/email \\
  -H 'content-type: application/json' \\
  -H 'origin: http://localhost:5173' \\
  -d '{"email":"you@example.com","password":"supersecret1"}'`;

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-[15px] text-muted-foreground">
      <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />
      <span>{children}</span>
    </li>
  );
}

export function LiveNow() {
  return (
    <section className="halo mx-auto max-w-[1280px] px-6 pt-24">
      <div className="grid gap-16 lg:grid-cols-2 lg:gap-24">
        <div>
          <h2 className="grad font-display text-[56px] leading-[1.2] tracking-[-0.05em]">
            What is <span className="accent">live.</span>
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {LIVE.map((item) => (
              <Bullet key={item}>{item}</Bullet>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-[56px] leading-[1.2] tracking-[-0.05em] text-muted-foreground">
            What is next.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {NEXT.map((item) => (
              <Bullet key={item}>{item}</Bullet>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-20">
        <p className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
          It runs today
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-card p-5 font-mono text-[13px] leading-5 text-muted-foreground">
          <code>{SNIPPET}</code>
        </pre>
      </div>
    </section>
  );
}