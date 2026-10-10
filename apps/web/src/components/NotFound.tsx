import { Button } from "./ui/button";

export function NotFound() {
  return (
    <div className="relative min-h-screen">
      <div className="spot" />

      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col justify-center px-6">
        <div className="halo mx-auto w-full max-w-[560px] px-8 pt-10 pb-10">
          <p className="text-[11px] uppercase tracking-[0.02em] text-muted-foreground">
            404
          </p>
          <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
            That page does not exist
          </h1>
          <p className="mt-2 text-muted-foreground">
            The address you followed does not match anything in Heptadec.
          </p>
          <div className="mt-8">
            <Button size="lg" onClick={() => window.location.assign("/")}>
              Go home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
