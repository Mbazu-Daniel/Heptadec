import { useState, type FormEvent } from "react";
import { authClient } from "../auth";
import { Input } from "./ui/input";
import {
  AUTH_ERROR_CLASSNAME,
  AUTH_INPUT_CLASSNAME,
  AUTH_LABEL_CLASSNAME,
  AUTH_PRIMARY_BUTTON_CLASSNAME,
  AuthPage,
} from "./AuthShell";

interface ICreateOrganizationProps {
  onCreated: (slug: string) => void;
}

function slugFrom(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function CreateOrganization({ onCreated }: ICreateOrganizationProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shownSlug = slugEdited ? slug : slugFrom(name);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data, error: createError } = await authClient.organization.create({
        name,
        slug: shownSlug,
      });
      if (createError) {
        setError(createError.message ?? "The organization was not created.");
        return;
      }
      onCreated(data.slug);
    } catch {
      setError("That organization could not be created. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthPage
      wide
      eyebrow="Step 1 of 2"
      title="Create your organization"
      lede="Your team shares data sources, saved queries, and dashboards inside one organization."
    >
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <label className={AUTH_LABEL_CLASSNAME} htmlFor="org-name">
            Organization name
          </label>
          <Input
            id="org-name"
            className={AUTH_INPUT_CLASSNAME}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            placeholder="Acme Data"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className={AUTH_LABEL_CLASSNAME} htmlFor="org-slug">
            Address
          </label>
          <Input
            id="org-slug"
            className={AUTH_INPUT_CLASSNAME}
            value={shownSlug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxLength={60}
            placeholder="acme-data"
          />
        </div>

        {error ? (
          <div role="alert" className={AUTH_ERROR_CLASSNAME}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy || shownSlug.length === 0}
          className={AUTH_PRIMARY_BUTTON_CLASSNAME}
        >
          {busy ? "Creating…" : "Create organization"}
        </button>
      </form>
    </AuthPage>
  );
}
