import type { IAuthVars } from "../../common/middleware/require-session";
import type { ImageTarget } from "./contracts";

export interface IPresignImageInput {
  target: ImageTarget;
  contentType: string;
}

export type IImagesBindings = IAuthVars["Bindings"];
