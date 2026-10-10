import { FieldInput } from "./FieldInput";
import { maybeFieldOf, type IBlockProps } from "./fields";
import { ToggleFormArea } from "./ToggleFormArea";

export function CommonAdvanced({ kind, values, onChange }: IBlockProps) {
  const options = maybeFieldOf(kind, "options");
  if (options === null) {
    return null;
  }

  return (
    <ToggleFormArea title="Advanced">
      <FieldInput
        field={options}
        value={values[options.kind] ?? ""}
        onChange={(next) => onChange(options.kind, next)}
      />
    </ToggleFormArea>
  );
}
