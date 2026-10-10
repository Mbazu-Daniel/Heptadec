import { CommonAdvanced } from "./CommonAdvanced";
import { CommonServerInputs } from "./CommonServerInputs";
import type { IBlockProps } from "./fields";

export function ServerForm(props: IBlockProps) {
  return (
    <div className="grid gap-4">
      <CommonServerInputs {...props} />
      <CommonAdvanced {...props} />
    </div>
  );
}
