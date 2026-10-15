import { useEffect, useRef, useState } from "react";
import { readAvatar } from "../lib/avatar";
import {
  fetchMemberProfile,
  messageFor,
  saveMemberDisplayName,
  uploadAvatar,
} from "../api";
import { useImagesConfigured } from "../lib/images";
import type { IMe } from "@heptadec/api/auth-contracts";
import { authClient } from "../auth";
import { Avatar } from "./ui/feedback";
import { Input } from "./ui/input";
import {
  AUTH_ERROR_CLASSNAME,
  AUTH_GHOST_BUTTON_CLASSNAME,
  AUTH_INPUT_CLASSNAME,
  AUTH_LABEL_CLASSNAME,
  AUTH_PRIMARY_BUTTON_CLASSNAME,
  AUTH_SUCCESS_CLASSNAME,
  AuthPage,
} from "./AuthShell";

const MIN_PASSWORD = 8;

interface IMemberProfileProps {
  me: IMe;
  onReload: () => void;
  onBack: () => void;
}

export function MemberProfile({ me, onReload, onBack }: IMemberProfileProps) {
  const [image, setImage] = useState<string | null>(me.user.image);
  const [displayName, setDisplayName] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imagesConfigured = useImagesConfigured();

  useEffect(() => {
    let live = true;
    fetchMemberProfile()
      .then((profile) => {
        if (live) {
          setDisplayName(profile.displayName ?? "");
        }
      })
      .catch((caught: unknown) => {
        if (live) {
          setError(
            messageFor(caught, "Your name could not be loaded."),
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);

  function start(): void {
    setBusy(true);
    setError(null);
    setNotice(null);
  }

  function stop(): void {
    setBusy(false);
  }

  async function chooseImage(file: File): Promise<void> {
    start();
    try {
      const picture = await readAvatar(file);
      if (picture === null) {
        setError("Pick an image under 8 MB.");
        return;
      }
      const { path } = await uploadAvatar(picture);
      const result = await authClient.updateUser({ image: path });
      if (result.error) {
        setError(result.error.message ?? "That image was not saved.");
        return;
      }
      setImage(path);
      setNotice("Your image is updated.");
      onReload();
    } catch (caught) {
      setError(messageFor(caught, "That image could not be read."));
    } finally {
      stop();
    }
  }

  async function removeImage(): Promise<void> {
    start();
    try {
      const result = await authClient.updateUser({ image: null });
      if (result.error) {
        setError(result.error.message ?? "That image was not removed.");
        return;
      }
      setImage(null);
      setNotice("Your image is removed.");
      onReload();
    } catch {
      setError("That image could not be removed.");
    } finally {
      stop();
    }
  }

  async function saveName(): Promise<void> {
    start();
    try {
      await saveMemberDisplayName(
        displayName.trim().length === 0 ? null : displayName.trim(),
      );
      setNotice("Your name is updated.");
      onReload();
    } catch (caught) {
      setError(messageFor(caught, "The name was not saved."));
    } finally {
      stop();
    }
  }

  async function changePassword(): Promise<void> {
    if (next !== confirm) {
      setError("The new password and its repeat do not match.");
      return;
    }
    start();
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
      });
      if (result.error) {
        setError(
          result.error.code === "INVALID_PASSWORD"
            ? "The current password is not right."
            : (result.error.message ?? "The password was not changed."),
        );
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice("Your password is changed.");
    } catch {
      setError("That could not be saved. Try again in a moment.");
    } finally {
      stop();
    }
  }

  return (
    <AuthPage
      wide
      eyebrow="Your profile"
      title="Profile settings"
      lede="Your picture, the name this organization knows you by, and your password."
    >
      <div className="flex flex-col gap-8">
        <button
          type="button"
          className={AUTH_GHOST_BUTTON_CLASSNAME}
          onClick={onBack}
        >
          Back
        </button>

        {error ? (
          <div role="alert" className={AUTH_ERROR_CLASSNAME}>
            {error}
          </div>
        ) : null}
        {notice !== null && error === null ? (
          <div role="status" className={AUTH_SUCCESS_CLASSNAME}>
            {notice}
          </div>
        ) : null}

        <section className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            {image === null ? (
              <Avatar
                name={displayName === "" ? me.user.name : displayName}
                className="size-16 border-(--mk-hairline) text-xl"
              />
            ) : (
              <img
                src={image}
                alt=""
                className="size-16 shrink-0 rounded-full border-(--mk-hairline) object-cover"
              />
            )}
            <div className="flex flex-col gap-2">
              {imagesConfigured ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void chooseImage(file);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className={AUTH_GHOST_BUTTON_CLASSNAME}
                    onClick={() => fileInput.current?.click()}
                  >
                    Change image
                  </button>
                  {image === null ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      className={AUTH_GHOST_BUTTON_CLASSNAME}
                      onClick={() => void removeImage()}
                    >
                      Remove image
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-(--mk-fg-muted)">
                  Image storage is not configured on this deployment.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL_CLASSNAME} htmlFor="profile-email">
              Email
            </label>
            <Input
              id="profile-email"
              className={AUTH_INPUT_CLASSNAME}
              value={me.user.email}
              readOnly
              disabled
            />
            <p className="text-sm text-(--mk-fg-muted)">
              The address you sign in with. An owner cannot change it for you.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-5 border-t border-(--mk-hairline) pt-8">
          <h2 className="text-sm font-semibold text-(--mk-fg-primary)">
            Name
          </h2>
          <div className="flex flex-col gap-2">
            <label className={AUTH_LABEL_CLASSNAME} htmlFor="profile-name">
              Name
            </label>
            <Input
              id="profile-name"
              className={AUTH_INPUT_CLASSNAME}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={120}
              placeholder="Platform Lead"
              autoComplete="name"
            />
            <p className="text-sm text-(--mk-fg-muted)">
              What everyone in this organization sees, in the sidebar and the
              team list. Leave it empty to fall back to the name on your account.
            </p>
          </div>
          <SectionActions onSave={saveName} busy={busy} label="Save name" />
        </section>

        <section className="flex flex-col gap-5 border-t border-(--mk-hairline) pt-8">
          <h2 className="text-sm font-semibold text-(--mk-fg-primary)">
            Password
          </h2>
          {me.user.hasPassword ? (
            <>
              <div className="flex flex-col gap-2">
                <label
                  className={AUTH_LABEL_CLASSNAME}
                  htmlFor="profile-current"
                >
                  Current password
                </label>
                <Input
                  id="profile-current"
                  type="password"
                  className={AUTH_INPUT_CLASSNAME}
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label className={AUTH_LABEL_CLASSNAME} htmlFor="profile-next">
                    New password
                  </label>
                  <Input
                    id="profile-next"
                    type="password"
                    className={AUTH_INPUT_CLASSNAME}
                    value={next}
                    onChange={(event) => setNext(event.target.value)}
                    minLength={MIN_PASSWORD}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={AUTH_LABEL_CLASSNAME} htmlFor="profile-confirm">
                    Repeat new password
                  </label>
                  <Input
                    id="profile-confirm"
                    type="password"
                    className={AUTH_INPUT_CLASSNAME}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    minLength={MIN_PASSWORD}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <p className="text-sm text-(--mk-fg-muted)">
                At least {MIN_PASSWORD} characters.
              </p>
              <SectionActions
                onSave={changePassword}
                busy={busy}
                label="Change password"
              />
            </>
          ) : (
            <p className="text-sm text-(--mk-fg-muted)">
              You sign in with a social provider, so there is no password to
              change. Sign out and use its button to sign back in.
            </p>
          )}
        </section>
      </div>
    </AuthPage>
  );
}

function SectionActions({
  onSave,
  busy,
  label,
}: {
  onSave: () => Promise<void>;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      className={`${AUTH_PRIMARY_BUTTON_CLASSNAME} max-w-[240px]`}
      onClick={() => void onSave()}
    >
      {label}
    </button>
  );
}
