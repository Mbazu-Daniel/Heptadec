import { CommonServerInputs } from "./CommonServerInputs";
import type { IBlockProps } from "./fields";

export function ServerForm(props: IBlockProps) {
  return <CommonServerInputs {...props} />;
}
