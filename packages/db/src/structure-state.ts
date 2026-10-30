/**
 * Where one source's structure stands with the app: read, waiting to be read, or
 * refused.
 *
 * It is a file of its own because `apps/api`'s wire contract names it, and the
 * browser imports that contract. The table column that stores it lives beside
 * randomUUID and the driver, which a browser bundle has no business pulling in.
 */
export type StructureState = "pending" | "ready" | "failed";
