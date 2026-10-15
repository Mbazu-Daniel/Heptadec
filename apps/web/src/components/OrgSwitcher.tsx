import type { IMembership } from "@heptadec/api/organization-contracts";

const NEW_ORGANIZATION = "new";

interface IOrgSwitcherProps {
  memberships: IMembership[];
  onSwitch: (organizationId: string) => void;
  onCreate: () => void;
}

function OrgTile({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-lg bg-cyan text-sm font-bold text-on-accent"
    >
      {initial}
    </span>
  );
}

export function OrgSwitcher({
  memberships,
  onSwitch,
  onCreate,
}: IOrgSwitcherProps) {
  if (memberships.length === 0) {
    return null;
  }
  const active =
    memberships.find((membership) => membership.active) ?? memberships[0]!;

  return (
    <label className="flex items-center gap-2 px-1">
      <OrgTile name={active.organization.name} />
      <select
        aria-label="Active organization"
        value={active.organization.id}
        onChange={(event) =>
          event.target.value === NEW_ORGANIZATION
            ? onCreate()
            : onSwitch(event.target.value)
        }
        className="h-9 min-w-0 flex-1 cursor-pointer border border-border bg-background px-2 font-mono text-xs text-fg outline-none transition-colors hover:border-cyan/40 focus:border-cyan/60"
      >
        {memberships.map((membership) => (
          <option
            key={membership.organization.id}
            value={membership.organization.id}
          >
            {membership.organization.name}
          </option>
        ))}
        <option value={NEW_ORGANIZATION}>+ New organization</option>
      </select>
    </label>
  );
}
