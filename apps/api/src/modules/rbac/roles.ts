import { BadRequestException } from "../../common/exceptions/index";
import type { Role } from "./permissions";
import { isRole } from "./permissions";

export function roleOf(value: string): Role {
  if (!isRole(value)) {
    throw new BadRequestException(
      `The stored role "${value}" is not one this app defines`,
    );
  }
  return value;
}
