import { useCallback, useEffect, useState } from "react";
import {
  IconBrandSlack,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconMail,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  CHANNEL_SPECS,
  NOTIFICATION_KINDS,
  NOTIFICATION_LABELS,
  type IChannelSpec,
  type IChannelView,
  type INotificationChannel,
  type INotificationChannelListResponse,
  type NotificationKind,
} from "@heptadec/api/notification-contracts";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  listNotificationChannels,
  messageFor,
  updateNotificationChannel,
} from "../api";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import {
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  VIEW_CLASSNAME,
  Workspace,
} from "./workspace";

const GRID_CARD =
  "flex flex-col items-center gap-2 rounded-xl border-2 border-border bg-foreground/5 px-3 py-4 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-fg data-[selected=true]:border-cyan data-[selected=true]:text-fg";

function ChannelIcon({ kind }: { kind: NotificationKind }) {
  const props = { size: 20, strokeWidth: 1.5 };
  if (kind === "slack") {
    return <IconBrandSlack {...props} />;
  }
  return <IconMail {...props} />;
}

export function NotificationChannels({ isOwner }: { isOwner: boolean }) {
  const [channels, setChannels] = useState<INotificationChannel[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<NotificationKind>("email");
  const [editing, setEditing] = useState<INotificationChannel | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [recipients, setRecipients] = useState<string[]>([""]);

  const reload = useCallback(async () => {
    setProblem(null);
    try {
      const listed: INotificationChannelListResponse =
        await listNotificationChannels();
      setChannels(listed.notificationChannels);
    } catch (caught) {
      setProblem(messageFor(caught, "The channels could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const spec = CHANNEL_SPECS[kind];

  function reset(): void {
    setEditing(null);
    setName("");
    setValues({});
    setRecipients([""]);
  }

  function choose(next: NotificationKind): void {
    setKind(next);
    reset();
    setProblem(null);
    setNotice(null);
  }

  function edit(channel: INotificationChannel): void {
    setKind(channel.kind);
    setEditing(channel);
    setName(channel.name);
    setRecipients(
      channel.recipients.length === 0 ? [""] : [...channel.recipients, ""],
    );
    setValues(fromView(channel.config));
    setProblem(null);
    setNotice(null);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setProblem(null);
    setNotice(null);

    const body = {
      name: name.trim(),
      kind,
      ...values,
      ...(spec.recipients
        ? { recipients: recipients.map((entry) => entry.trim()).filter((entry) => entry !== "") }
        : {}),
    };

    try {
      if (editing === null) {
        await createNotificationChannel(body);
      } else {
        await updateNotificationChannel(editing.id, body);
      }
      reset();
      await reload();
      setNotice("That channel is saved.");
    } catch (caught) {
      setProblem(messageFor(caught, "That channel could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(channel: INotificationChannel): Promise<void> {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await deleteNotificationChannel(channel.id);
      if (editing?.id === channel.id) {
        reset();
      }
      await reload();
      setNotice(`${channel.name} is removed.`);
    } catch (caught) {
      setProblem(messageFor(caught, "That channel could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) {
    return (
      <Workspace
        view={
          <div className={VIEW_CLASSNAME}>
            <EmptyState
              title="Owners only"
              body="Notification channels are managed by an owner of this organization."
            />
          </div>
        }
      />
    );
  }

  return (
    <div className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {channels === null ? "" : `${channels.length} connected`}
        </span>
      </div>

      <Workspace
        view={
          <div className="mx-auto max-w-3xl">
            {problem !== null ? <Alert className="mb-4">{problem}</Alert> : null}
            {notice !== null ? (
              <Alert tone="success" className="mb-4">
                {notice}
              </Alert>
            ) : null}

            <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Pick where alerts go
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {NOTIFICATION_KINDS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  data-selected={entry === kind}
                  aria-pressed={entry === kind}
                  onClick={() => choose(entry)}
                  className={GRID_CARD}
                >
                  <ChannelIcon kind={entry} />
                  <span>{NOTIFICATION_LABELS[entry]}</span>
                </button>
              ))}
            </div>

            <h2 className="mt-8 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Fill the next fields.
            </h2>

            <div className="mt-2 flex flex-col gap-4">
              <FieldGroup>
                <FieldLabel htmlFor="channel-name">Name</FieldLabel>
                <Input
                  id="channel-name"
                  value={name}
                  placeholder="On-call alerts"
                  onChange={(event) => setName(event.target.value)}
                />
              </FieldGroup>

              <div className="grid gap-4 sm:grid-cols-2">
                {spec.fields.map((field) => (
                  <div
                    key={field.kind}
                    className={field.wide ? "sm:col-span-2" : undefined}
                  >
                    <ChannelField
                      id={`channel-${field.kind}`}
                      label={field.label}
                      placeholder={field.placeholder}
                      secret={field.secret}
                      optional={field.optional}
                      editing={editing !== null}
                      value={values[field.kind] ?? ""}
                      onChange={(next) =>
                        setValues((current) => ({ ...current, [field.kind]: next }))
                      }
                    />
                  </div>
                ))}
              </div>

              {spec.recipients ? (
                <RecipientList
                  recipients={recipients}
                  onChange={setRecipients}
                />
              ) : null}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void save()}
                  disabled={busy || !isComplete(name, spec, values, recipients)}
                >
                  <IconCheck size={16} strokeWidth={1.5} />
                  {editing === null ? "Connect channel" : "Save channel"}
                </Button>
                {editing !== null ? (
                  <Button variant="ghost" onClick={reset} className={SMALL_BUTTON_CLASSNAME}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-10 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Connected
              </h2>
              {channels !== null && channels.length > 0 ? (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {channels.length}
                </span>
              ) : null}
            </div>
            {channels === null ? (
              <p className="mt-2 text-xs text-muted-foreground">Loading</p>
            ) : channels.length === 0 ? (
              <EmptyState
                title="Nothing connected yet"
                body="Every channel you connect receives each alert that fires, alongside the others."
              />
            ) : (
              <table className={`${TABLE_CLASSNAME} mt-2`} aria-label="Notification channels">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>Name</th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>Kind</th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>Reaches</th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id} className={TABLE_ROW_CLASSNAME}>
                      <td className={`${TABLE_CELL_CLASSNAME} font-medium`}>
                        {channel.name}
                      </td>
                      <td className={`${TABLE_CELL_CLASSNAME} text-muted-foreground`}>
                        {NOTIFICATION_LABELS[channel.kind]}
                      </td>
                      <td
                        className={`${TABLE_CELL_CLASSNAME} font-mono text-xs text-muted-foreground`}
                      >
                        {channel.recipients.length === 0
                          ? "—"
                          : channel.recipients.join(", ")}
                      </td>
                      <td className={`${TABLE_CELL_CLASSNAME} text-right`}>
                        <Button
                          variant="ghost"
                          className={SMALL_BUTTON_CLASSNAME}
                          disabled={busy}
                          onClick={() => edit(channel)}
                        >
                          <IconPencil size={14} strokeWidth={1.5} />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                          disabled={busy}
                          onClick={() => void remove(channel)}
                        >
                          <IconTrash size={14} strokeWidth={1.5} />
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        }
      />
    </div>
  );
}

function isComplete(
  name: string,
  spec: IChannelSpec,
  values: Record<string, string>,
  recipients: string[],
): boolean {
  if (name.trim() === "") {
    return false;
  }
  const addressed = recipients.filter((entry) => entry.trim() !== "");
  if (spec.recipients && addressed.length === 0) {
    return false;
  }
  return spec.fields.every(
    (field) => field.optional || field.secret || (values[field.kind] ?? "").trim() !== "",
  );
}

function fromView(view: IChannelView): Record<string, string> {
  const text: Record<string, string> = {};
  for (const [key, value] of Object.entries(view)) {
    if (key !== "kind" && value !== null) {
      text[key] = String(value);
    }
  }
  return text;
}

function ChannelField({
  id,
  label,
  placeholder,
  secret,
  optional,
  editing,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  secret: boolean;
  optional: boolean;
  editing: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <FieldGroup>
      <FieldLabel htmlFor={id}>
        {label}{" "}
        {optional ? <span className="text-[11px]">— optional</span> : null}
        {secret && editing ? (
          <span className="text-[11px]">— saved, leave blank to keep</span>
        ) : null}
      </FieldLabel>
      {secret ? (
        <SecretInput
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
        />
      ) : (
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono"
        />
      )}
    </FieldGroup>
  );
}

function SecretInput({
  id,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={shown ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        autoComplete="new-password"
        onChange={(event) => onChange(event.target.value)}
        className="pr-10 font-mono"
      />
      <button
        type="button"
        onClick={() => setShown((current) => !current)}
        title={shown ? "Hide" : "Show"}
        aria-label={shown ? `Hide ${id}` : `Show ${id}`}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-fg"
      >
        {shown ? <IconEyeOff size={16} strokeWidth={1.5} /> : <IconEye size={16} strokeWidth={1.5} />}
      </button>
    </div>
  );
}

function RecipientList({
  recipients,
  onChange,
}: {
  recipients: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <FieldGroup>
      <FieldLabel>To Addresses</FieldLabel>
      {recipients.map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={entry}
            placeholder="email@example.com"
            onChange={(event) =>
              onChange(
                recipients.map((current, position) =>
                  position === index ? event.target.value : current,
                ),
              )
            }
            className="font-mono"
          />
          <Button
            variant="ghost"
            className={SMALL_BUTTON_CLASSNAME}
            disabled={recipients.length === 1}
            onClick={() =>
              onChange(recipients.filter((_, position) => position !== index))
            }
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        className={SMALL_BUTTON_CLASSNAME}
        onClick={() => onChange([...recipients, ""])}
      >
        <IconPlus size={14} strokeWidth={1.5} />
        Add
      </Button>
    </FieldGroup>
  );
}