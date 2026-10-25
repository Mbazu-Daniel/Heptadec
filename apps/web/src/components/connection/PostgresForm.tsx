import { CommonServerInputs } from "./CommonServerInputs";
import { FieldInput } from "./FieldInput";
import { fieldOf, type IBlockProps } from "./fields";

export function PostgresForm(props: IBlockProps) {
  const schema = fieldOf("postgres", "schema");
  return (
    <CommonServerInputs {...props}>
      <FieldInput
        field={schema}
        value={props.values[schema.kind] ?? ""}
        onChange={(next) => props.onChange(schema.kind, next)}
      />
    </CommonServerInputs>
  );
}
