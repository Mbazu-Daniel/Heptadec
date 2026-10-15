import { FieldInput } from "./FieldInput";
import { maybeFieldOf, type IBlockProps } from "./fields";
import { ToggleFormArea } from "./ToggleFormArea";

const TLS_FIELDS = ["caCert", "clientCert", "clientKey"] as const;

export function CommonAdvanced({ kind, mode, values, onChange }: IBlockProps) {
  const options = maybeFieldOf(kind, "options");
  // Certificates are only carried over a TLS connection.
  const certs =
    mode === "tls"
      ? TLS_FIELDS.flatMap((field) => {
          const found = maybeFieldOf(kind, field);
          return found === null ? [] : [found];
        })
      : [];

  if (options === null && certs.length === 0) {
    return null;
  }

  return (
    <ToggleFormArea title="Advanced">
      {options === null ? null : (
        <FieldInput
          field={options}
          value={values[options.kind] ?? ""}
          onChange={(next) => onChange(options.kind, next)}
        />
      )}
      {certs.map((field) => (
        <FieldInput
          key={field.kind}
          field={field}
          value={values[field.kind] ?? ""}
          onChange={(next) => onChange(field.kind, next)}
        />
      ))}
    </ToggleFormArea>
  );
}
