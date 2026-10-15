import { useEffect, useState } from "react";
import {
  ApiError,
  acceptInvitation,
  declineInvitation,
  fetchInvitation,
  messageFor,
} from "../api";
import type { IInvitationPreviewResponse } from "@heptadec/api/invitation-contracts";
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
  const [preview, setPreview] = useState<IInvitationPreviewResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setPreview(null);
    setProblem(null);
    fetchInvitation(invitationId)
      .then((found) => {
        if (live) {
          setPreview(found);
        }
      })
      .catch((caught: unknown) => {
        if (live) {
          setProblem(
            caught instanceof ApiError && caught.code === "not_found"
              ? caught.message
              : "That invitation could not be loaded. Try again.",
          );
        }
      });
    return () => {
      live = false;
    };
  }, [invitationId]);

  async function act(work: (id: string) => Promise<void>, done: () => void): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await work(invitationId);
      done();
    } catch (caught) {
      setProblem(messageFor(caught, "That did not go through."));
    } finally {
      setBusy(false);
    }
  }

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
          ) : problem ? (
            <>
              <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
                Invitation unavailable
              </h1>
              <p className="mt-2 text-muted-foreground">{problem}</p>
            </>
          ) : (
            <>
              <h1 className="grad mt-3 font-display text-2xl tracking-[-0.05em]">
                Invitation
              </h1>
              <p className="mt-2 text-muted-foreground">Loading the invitation.</p>
            </>
          )}

          {preview && problem ? <Alert className="mt-6">{problem}</Alert> : null}

          {preview ? (
            <div className="mt-8 flex flex-wrap items-center gap-4">
              {signedIn ? (
                <>
                  <Button
                    size="lg"
                    disabled={busy}
                    onClick={() => void act(acceptInvitation, onDone)}
                  >
                    {busy ? "Joining" : "Accept invitation"}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(declineInvitation, onDeclined)}
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
          ) : problem ? (
            <div className="mt-8">
              <Button onClick={onDeclined}>Back to sign in</Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
