import { useState } from "react";
import type { ConnectionFieldKind, IConnectionField } from "@heptadec/api/data-source-contracts";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

const MULTILINE: readonly ConnectionFieldKind[] = [
  "caCert",
  "clientCert",
  "clientKey",
  "options",
];

const SECRET: readonly ConnectionFieldKind[] = ["password", "token"];

export function FieldInput({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: IConnectionField;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const label = (
    <span className="text-xs text-muted-foreground">
      {field.label}{" "}
      {field.required ? null : <span className="text-[11px]">— optional</span>}
    </span>
  );

  if (MULTILINE.includes(field.kind)) {
    return (
      <label className="flex flex-col gap-1.5">
        {label}
        <Textarea
          rows={field.kind === "options" ? 2 : 4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          className="rounded-none font-mono"
          spellCheck={false}
        />
      </label>
    );
  }

  if (SECRET.includes(field.kind)) {
    return <SecretInput field={field} label={label} value={value} onChange={onChange} />;
  }

  return (
    <label className="flex flex-col gap-1.5">
      {label}
      <Input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={field.required}
        inputMode={field.kind === "port" ? "numeric" : undefined}
        placeholder={placeholder ?? field.placeholder}
        className="rounded-none font-mono"
      />
    </label>
  );
}

function SecretInput({
  field,
  label,
  value,
  onChange,
}: {
  field: IConnectionField;
  label: React.ReactNode;
  value: string;
  onChange: (next: string) => void;
}) {
  const [shown, setShown] = useState(false);

  return (
    <label className="flex flex-col gap-1.5">
      {label}
      <div className="relative">
        <Input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          autoComplete="new-password"
          placeholder={field.placeholder}
          className="rounded-none pr-9 font-mono"
        />
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          title={shown ? "Hide" : "Show"}
          aria-label={shown ? `Hide ${field.label}` : `Show ${field.label}`}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-fg"
        >
          <span className="material-symbols-outlined text-[17px]">
            {shown ? "visibility_off" : "visibility"}
          </span>
        </button>
      </div>
    </label>
  );
}
