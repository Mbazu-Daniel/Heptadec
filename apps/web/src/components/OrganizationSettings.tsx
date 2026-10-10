import { useEffect, useRef, useState } from "react";
import type { IMembership } from "@heptadec/api/organization-contracts";
import { readAvatar } from "../lib/avatar";
import { authClient } from "../auth";
import { deleteOrganization, messageFor } from "../api";
import { Avatar } from "./ui/feedback";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { SMALL_BUTTON_CLASSNAME, VIEW_CLASSNAME } from "./workspace";

const MAX_SLUG = 80;

const MAX_NAME = 120;

export function OrganizationSettings({
  membership,
  onChanged,
}: {
  membership: IMembership;
  onChanged: () => void;
}) {
  const isOwner = membership.role === "owner";
  const [name, setName] = useState(membership.organization.name);
  const [slug, setSlug] = useState(membership.organization.slug);
  const [logo, setLogo] = useState<string | null>(membership.organization.logo);
  const [erasing, setErasing] = useState(false);
  const [typedSlug, setTypedSlug] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setName(membership.organization.name);
    setSlug(membership.organization.slug);
    setLogo(membership.organization.logo);
  }, [membership.organization.name, membership.organization.slug, membership.organization.logo]);

  function start(): void {
    setBusy(true);
    setError(null);
    setNotice(null);
  }

  async function pickLogo(file: File): Promise<void> {
    start();
    try {
      const picture = await readAvatar(file);
      const result = await authClient.organization.update({
        data: { logo: picture },
      });
      if (result.error) {
        setError(result.error.message ?? "The logo was not saved.");
        return;
      }
      setLogo(picture);
      setNotice("The logo is updated.");
      onChanged();
    } catch {
      setError("That image could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo(): Promise<void> {
    start();
    try {
      const result = await authClient.organization.update({ data: { logo: null } });
      if (result.error) {
        setError(result.error.message ?? "The logo was not removed.");
        return;
      }
      setLogo(null);
      setNotice("The logo is removed.");
      onChanged();
    } catch {
      setError("That image could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    start();
    try {
      const result = await authClient.organization.update({
        data: { name: name.trim(), slug: slug.trim() },
      });
      if (result.error) {
        setError(
          result.error.code === "ORGANIZATION_SLUG_TAKEN"
            ? "That slug is already taken."
            : (result.error.message ?? "The organization was not saved."),
        );
        return;
      }
      setNotice("The organization is updated.");
      onChanged();
    } catch {
      setError("That could not be saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function erase(): Promise<void> {
    start();
    try {
      await deleteOrganization(typedSlug.trim());
      window.location.assign("/");
    } catch (caught) {
      setError(messageFor(caught, "The organization could not be deleted."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={VIEW_CLASSNAME}>
      <div className="flex flex-col gap-5 px-6 pb-6 pt-6">
        <div className="flex items-center gap-3">
          {logo === null ? (
            <Avatar
              name={membership.organization.name}
              className="size-10 rounded-lg border border-border text-sm"
            />
          ) : (
            <img
              src={logo}
              alt=""
              className="size-10 shrink-0 rounded-lg border border-border object-cover"
            />
          )}
          {isOwner ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void pickLogo(file);
                  }
                }}
              />
              <Button
                variant="ghost"
                className={SMALL_BUTTON_CLASSNAME}
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                Change logo
              </Button>
              {logo === null ? null : (
                <Button
                  variant="ghost"
                  className={SMALL_BUTTON_CLASSNAME}
                  disabled={busy}
                  onClick={() => void removeLogo()}
                >
                  Remove
                </Button>
              )}
            </>
          ) : null}
        </div>

        {isOwner ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup>
              <FieldLabel htmlFor="org-name">Name</FieldLabel>
              <Input
                id="org-name"
                value={name}
                maxLength={MAX_NAME}
                onChange={(event) => setName(event.target.value)}
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="org-slug">URL slug</FieldLabel>
              <Input
                id="org-slug"
                value={slug}
                maxLength={MAX_SLUG}
                onChange={(event) => setSlug(event.target.value)}
                className="font-mono"
              />
            </FieldGroup>
          </div>
        ) : (
          <dl className="grid gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd>{membership.organization.name}</dd>
            </div>
          </dl>
        )}

        {isOwner ? (
          <div>
            <Button
              disabled={busy || name.trim() === "" || slug.trim() === ""}
              onClick={() => void save()}
            >
              Save organization
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only an owner can change the organization's settings.
          </p>
        )}

        {isOwner ? (
          <div className="flex flex-col gap-3 border-t-2 border-red pt-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red">
              Danger zone
            </h3>
            {erasing ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  This erases the organization, its data sources, queries,
                  dashboards, alerts and channels for everyone. Type{" "}
                  <span className="font-mono text-fg">
                    {membership.organization.slug}
                  </span>{" "}
                  to confirm.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    value={typedSlug}
                    placeholder={membership.organization.slug}
                    onChange={(event) => setTypedSlug(event.target.value)}
                    className="h-8 max-w-64 font-mono text-xs"
                    aria-label="Type the organization slug"
                  />
                  <Button
                    variant="default"
                    className={`${SMALL_BUTTON_CLASSNAME} bg-red text-destructive-foreground hover:bg-red/85`}
                    disabled={busy || typedSlug.trim() !== membership.organization.slug}
                    onClick={() => void erase()}
                  >
                    {busy ? "Erasing…" : "Erase it"}
                  </Button>
                  <Button
                    variant="ghost"
                    className={SMALL_BUTTON_CLASSNAME}
                    onClick={() => {
                      setErasing(false);
                      setTypedSlug("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                  onClick={() => setErasing(true)}
                >
                  Delete organization
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {error !== null ? <Alert>{error}</Alert> : null}
        {notice !== null && error === null ? <Alert tone="success">{notice}</Alert> : null}
      </div>
    </section>
  );
}
