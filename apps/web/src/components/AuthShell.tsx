import type { ReactNode } from "react";

interface IAuthPageProps {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
  footnote?: ReactNode;
  wide?: boolean;
}

export const AUTH_INPUT_CLASSNAME =
  "h-12 w-full rounded-[12px] border border-(--mk-hairline) bg-(--mk-tint-f5) px-4 text-sm text-(--mk-fg-primary) outline-none transition-all duration-150 placeholder:text-(--mk-fg-muted)/50 hover:border-(--mk-active)/60 focus:border-(--mk-cyan) focus:shadow-[0_0_14px_color-mix(in_srgb,var(--mk-cyan)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-50";

export const AUTH_LABEL_CLASSNAME = "text-sm text-(--mk-fg-muted)";

export const AUTH_PRIMARY_BUTTON_CLASSNAME =
  "flex h-12 w-full items-center justify-center gap-2 rounded-[16px] border border-transparent bg-(--mk-cyan) text-sm font-semibold text-(--mk-on-accent) transition-all duration-200 hover:opacity-90 hover:shadow-[0_1px_14px_color-mix(in_srgb,var(--mk-cyan)_12%,transparent),0_3px_32px_color-mix(in_srgb,var(--mk-cyan)_18%,transparent)] disabled:pointer-events-none disabled:opacity-50";

export const AUTH_SOCIAL_BUTTON_CLASSNAME =
  "flex h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-(--mk-hairline) bg-(--mk-tint-f10) px-4 text-sm font-semibold text-(--mk-fg-primary) transition-all duration-150 hover:border-(--mk-active) disabled:pointer-events-none disabled:opacity-50";

export const AUTH_GHOST_BUTTON_CLASSNAME =
  "text-sm font-semibold text-(--mk-fg-muted) transition-colors duration-150 hover:text-(--mk-fg-primary)";

export const AUTH_LINK_BUTTON_CLASSNAME =
  "text-sm font-semibold text-(--mk-cyan) underline-offset-4 transition-colors duration-150 hover:underline";

export const AUTH_ERROR_CLASSNAME =
  "rounded-[12px] border border-(--mk-error)/30 bg-(--mk-error-container)/20 px-3 py-2 text-sm text-(--mk-error)";

export const AUTH_SUCCESS_CLASSNAME =
  "rounded-[12px] border border-(--mk-tertiary-container)/30 bg-(--mk-tertiary-container)/10 px-3 py-2 text-sm text-(--mk-tertiary-container)";

function AuthHeader() {
  return (
    <header className="relative z-10 border-b border-(--mk-hairline) bg-[color-mix(in_srgb,var(--mk-bg)_60%,transparent)] backdrop-blur-[12px]">
      <div className="mx-auto flex h-[58px] max-w-[1280px] items-center justify-between px-6">
        <a href="/" className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-(--mk-cyan) shadow-[0_0_8px_color-mix(in_srgb,var(--mk-cyan)_80%,transparent)]" />
          <span className="font-display text-[21px] leading-[26px] font-semibold tracking-tight text-(--mk-fg-primary)">
            Heptadec
          </span>
        </a>
        <span className="font-mono text-[12px] uppercase tracking-widest text-(--mk-fg-muted)">
          Open source
        </span>
      </div>
    </header>
  );
}

function AuthCard({
  eyebrow,
  title,
  lede,
  children,
  maxWidth,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
  maxWidth: string;
}) {
  return (
    <div
      className={`relative w-full ${maxWidth} overflow-hidden rounded-t-[24px] rounded-b-[16px] border-t border-(--mk-hairline) bg-(--mk-surface)`}
    >
      <div className="absolute top-0 left-1/2 h-[100px] w-[460px] -translate-x-1/2 pointer-events-none bg-[radial-gradient(60%_100%_at_50%_0,color-mix(in_srgb,var(--mk-cyan)_36%,transparent)_0%,color-mix(in_srgb,var(--mk-cyan)_4%,transparent)_50%,transparent_100%)]" />
      <div className="relative px-8 pt-10 pb-10">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-widest text-(--mk-cyan)">
          {eyebrow}
        </p>
        <h1 className="mt-3 font-display text-[30px] leading-[36px] font-semibold tracking-[-0.02em] bg-gradient-to-br from-(--mk-cyan) via-(--mk-cyan) to-[color-mix(in_srgb,var(--mk-cyan)_45%,transparent)] bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-(--mk-fg-muted)">
          {lede}
        </p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

function TrustRow() {
  return (
    <div className="mt-6 flex items-center gap-3 font-mono text-[13px] text-(--mk-fg-muted)">
      <span className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-(--mk-tertiary-container) shadow-[0_0_6px_color-mix(in_srgb,var(--mk-tertiary-container)_80%,transparent)]" />
        <span>Read-only by default</span>
      </span>
      <span className="w-1 h-1 rounded-full bg-(--mk-outline-variant)" />
      <span>Self-hosted</span>
    </div>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mk relative min-h-screen overflow-x-hidden bg-(--mk-bg) text-(--mk-on-surface)">
      <div className="absolute -top-32 right-[-10%] w-[900px] h-[900px] pointer-events-none rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--mk-cyan)_9%,transparent)_0%,color-mix(in_srgb,var(--mk-cyan)_2%,transparent)_45%,transparent_70%)] blur-[60px]" />
      <AuthHeader />
      {children}
    </div>
  );
}

export function AuthPage({
  eyebrow,
  title,
  lede,
  children,
  footnote,
  wide,
}: IAuthPageProps) {
  return (
    <AuthShell>
      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-58px)] w-full max-w-[1280px] flex-col items-center justify-center px-6 py-16">
        <AuthCard
          eyebrow={eyebrow}
          title={title}
          lede={lede}
          maxWidth={wide ? "max-w-[560px]" : "max-w-[440px]"}
        >
          {children}
        </AuthCard>
        {footnote ? <div className="mt-6">{footnote}</div> : null}
        <TrustRow />
      </div>
    </AuthShell>
  );
}

const RESULT_ROWS = [
  { id: "a91f", table: "events", region: "eu-west-1", status: "delivered" },
  { id: "b204", table: "events", region: "us-east-1", status: "delivered" },
  { id: "c77e", table: "orders", region: "eu-west-1", status: "queued" },
  { id: "d013", table: "orders", region: "ap-south-1", status: "delivered" },
];

export function AuthResultVisual() {
  return (
    <div className="relative w-full select-none">
      <div className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--mk-cyan)/10 blur-[80px] pointer-events-none" />
      <div className="auth-float relative overflow-hidden rounded-[20px] border border-(--mk-hairline) bg-(--mk-surface) shadow-[0_0_30px_color-mix(in_srgb,var(--mk-cyan)_8%,transparent)]">
        <div className="flex items-center justify-between border-b border-(--mk-hairline) bg-[color-mix(in_srgb,var(--mk-bg)_40%,transparent)] px-4 py-3">
          <span className="flex items-center gap-2 font-mono text-[13px] text-(--mk-fg-muted)">
            <span className="w-1.5 h-1.5 rounded-full bg-(--mk-tertiary-container) animate-pulse" />
            orders-prod
          </span>
          <span className="font-mono text-[13px] text-(--mk-cyan)">
            read-only
          </span>
        </div>
        <div className="overflow-x-auto border-b border-(--mk-hairline) px-5 py-3.5 font-mono text-[13.5px] leading-relaxed whitespace-pre-wrap break-words">
          <span className="text-(--mk-cyan)">SELECT </span>
          <span className="text-(--mk-fg-primary)">
            id, table, region, status{" "}
          </span>
          <span className="text-(--mk-cyan)">FROM </span>
          <span className="text-(--mk-fg-primary)">events </span>
          <span className="text-(--mk-cyan)">UNION ALL </span>
          <span className="text-(--mk-fg-primary)">orders </span>
          <span className="text-(--mk-cyan)">LIMIT </span>
          <span className="text-(--mk-cyan)">4</span>
        </div>
        <div className="divide-y divide-(--mk-hairline)/30 font-mono text-[13.5px]">
          {RESULT_ROWS.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[52px_1fr_1fr_auto] items-center gap-4 px-5 py-3"
            >
              <span className="text-(--mk-fg-primary)">{row.id}</span>
              <span className="text-(--mk-fg-muted)">{row.table}</span>
              <span className="text-(--mk-fg-muted)">{row.region}</span>
              <span
                className={
                  row.status === "queued"
                    ? "text-(--mk-status-orange)"
                    : "text-(--mk-tertiary-container)"
                }
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-(--mk-hairline) bg-[color-mix(in_srgb,var(--mk-bg)_40%,transparent)] px-4 py-2.5 font-mono text-[13px] text-(--mk-fg-muted)">
          <span>4 rows</span>
          <span>11ms</span>
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap items-center gap-2 font-mono text-[12px]">
        {["signed", "scoped", "audited"].map((chip) => (
          <span
            key={chip}
            className="inline-flex h-6 items-center rounded-full border border-(--mk-hairline) bg-(--mk-tint-f5) px-3 text-(--mk-fg-muted)"
          >
            {chip}
          </span>
        ))}
        <span className="text-(--mk-fg-muted)">never a write key</span>
      </div>
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="relative flex-col justify-center overflow-hidden border-(--mk-hairline) bg-(--mk-bg) px-14 py-12 hidden lg:flex lg:min-h-screen lg:border-r">
      <div className="absolute inset-0 bg-[radial-gradient(color-mix(in_srgb,var(--mk-cyan)_22%,transparent)_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(75%_60%_at_30%_35%,black,transparent)]" />
      <div className="absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-(--mk-cyan)/12 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-(--mk-secondary)/10 blur-[100px] pointer-events-none" />
      <div className="relative mx-auto w-full max-w-[500px]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-(--mk-cyan) shadow-[0_0_8px_color-mix(in_srgb,var(--mk-cyan)_80%,transparent)]" />
          <span className="font-display text-[21px] leading-[26px] font-semibold tracking-tight text-(--mk-fg-primary)">
            Heptadec
          </span>
        </div>
        <h2 className="mt-10 font-display text-[44px] leading-[52px] font-medium tracking-[-0.02em] text-(--mk-fg-primary)">
          Your data,
          <br />
          in plain sight.
        </h2>
        <p className="mt-4 max-w-[440px] text-[16px] leading-relaxed text-(--mk-fg-muted)">
          Point Heptadec at your databases and ask real questions. Read-only
          by default, self-hosted in minutes.
        </p>
        <div className="mt-10">
          <AuthResultVisual />
        </div>
      </div>
    </div>
  );
}

export function AuthSplitLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk relative min-h-screen bg-(--mk-bg) text-(--mk-on-surface)">
      <div className="grid min-h-screen lg:grid-cols-2">
        <BrandPanel />
        <div className="relative flex min-h-screen flex-col overflow-x-hidden">
          <div className="absolute -top-32 right-[-10%] w-[700px] h-[700px] pointer-events-none rounded-full bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--mk-cyan)_7%,transparent)_0%,color-mix(in_srgb,var(--mk-cyan)_2%,transparent)_45%,transparent_70%)] blur-[60px]" />
          <div className="relative z-10 flex h-[58px] items-center px-6 lg:px-10">
            <a
              href="/"
              className="flex items-center gap-1.5 text-sm font-semibold text-(--mk-fg-muted) transition-colors duration-150 hover:text-(--mk-fg-primary)"
            >
              <span aria-hidden="true">←</span> Home
            </a>
          </div>
          <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
            <div className="w-full max-w-[400px]">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
