import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ApiError,
  acceptInvitation,
  declineInvitation,
  fetchInvitation,
  messageFor,
} from "../api";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";

interface IAcceptInvitationProps {
  invitationId: string;
  signedIn: boolean;
  onDone: () => void;
  onDeclined: () => void;
  onSignIn: () => void;
}

export function AcceptInvitation({
  invitationId,
  signedIn,
  onDone,
  onDeclined,
  onSignIn,
}: IAcceptInvitationProps) {
  const found = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: () => fetchInvitation(invitationId),
  });
  const preview = found.data ?? null;
  const loadProblem = found.isError
    ? found.error instanceof ApiError && found.error.code === "not_found"
      ? found.error.message
      : "That invitation could not be loaded. Try again."
    : null;

  const accept = useMutation({
    mutationFn: () => acceptInvitation(invitationId),
    onSuccess: onDone,
  });
  const decline = useMutation({
    mutationFn: () => declineInvitation(invitationId),
    onSuccess: onDeclined,
  });

  const busy = accept.isPending || decline.isPending;
  const actionProblem = accept.isError
    ? messageFor(accept.error, "That did not go through.")
    : decline.isError
      ? messageFor(decline.error, "That did not go through.")
      : null;

  return (
    <div className="relative min-h-screen">
      <div className="spot" />

      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col justify-center px-6">
        <div className="halo mx-auto w-full max-w-[560px] px-8 pt-10 pb-10">
          <p className="text-[12px] uppercase tracking-[0.02em] text-muted-foreground">
            Invitation
          </p>

          {preview ? (
            <>
              <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
                Join {preview.organizationName}
              </h1>
              <p className="mt-2 text-muted-foreground">
                You were invited as {preview.role}. This invitation was sent to{" "}
                {preview.email}.
              </p>
            </>
          ) : loadProblem ? (
            <>
              <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
                Invitation unavailable
              </h1>
              <p className="mt-2 text-muted-foreground">{loadProblem}</p>
            </>
          ) : (
            <>
              <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
                Invitation
              </h1>
              <p className="mt-2 text-muted-foreground">Loading the invitation.</p>
            </>
          )}

          {preview && actionProblem ? (
            <Alert className="mt-6">{actionProblem}</Alert>
          ) : null}

          {preview ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {signedIn ? (
                <>
                  <Button
                    size="lg"
                    disabled={busy}
                    onClick={() => accept.mutate()}
                  >
                    {busy ? "Joining" : "Accept invitation"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => decline.mutate()}
                  >
                    Decline
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" onClick={onSignIn}>
                    Sign in to accept
                  </Button>
                  <Button variant="ghost" onClick={onDeclined}>
                    Not you? Go back
                  </Button>
                </>
              )}
            </div>
          ) : loadProblem ? (
            <div className="mt-8">
              <Button onClick={onDeclined}>Back to sign in</Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
