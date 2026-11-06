import { createContext, useContext, type ReactNode } from "react";

const OrganizationIdContext = createContext<string | null>(null);

export function OrganizationProvider({
  organizationId,
  children,
}: {
  organizationId: string | null;
  children: ReactNode;
}) {
  return (
    <OrganizationIdContext.Provider value={organizationId}>
      {children}
    </OrganizationIdContext.Provider>
  );
}

export function useOrganizationId(): string {
  const organizationId = useContext(OrganizationIdContext);
  if (organizationId === null || organizationId === "") {
    throw new Error("Select an organization first");
  }
  return organizationId;
}
