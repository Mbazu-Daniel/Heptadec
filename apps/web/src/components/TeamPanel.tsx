import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelInvitation,
  listInvitations,
  listMembers,
  messageFor,
  removeMember,
  setMemberRole,
} from "../api";
import { authClient } from "../auth";
import type { Role } from "@heptadec/api/rbac";
import { Button } from "./ui/button";
import { Alert, Avatar, EmptyState } from "./ui/feedback";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import {
  FilterSummary,
  Inspector,
  PropertyList,
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  TOOLBAR_INPUT_CLASSNAME,
  TOOLBAR_SELECT_CLASSNAME,
  Toolbar,
  VIEW_CLASSNAME,
  Workspace,
  WorkspaceFooter,
} from "./workspace";

interface ITeamPanelProps {
  organizationId: string;
  role: Role;
}

const ASSIGNABLE: Role[] = ["owner", "editor", "viewer"];

const SELECT_CLASSNAME =
  "h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground";

export function TeamPanel({ organizationId, role }: ITeamPanelProps) {
  const isOwner = role === "owner";
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ["members", organizationId],
    queryFn: listMembers,
  });
  const invitationsQuery = useQuery({
    queryKey: ["invitations", organizationId],
    queryFn: listInvitations,
    enabled: isOwner,
  });
  const members = membersQuery.data?.members;
  const pending =
    invitationsQuery.data?.invitations.filter((row) => row.status === "pending") ??
    [];

  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");

  function refreshTeam(): void {
    queryClient.invalidateQueries({ queryKey: ["members", organizationId] });
    queryClient.invalidateQueries({ queryKey: ["invitations", organizationId] });
  }

  const changeRole = useMutation({
    mutationFn: (next: { memberId: string; role: Role }) =>
      setMemberRole(next.memberId, next.role),
    onSuccess: (_result, { role: next }) => {
      refreshTeam();
      setNotice(`Role changed to ${next}.`);
    },
  });
  const dropMember = useMutation({
    mutationFn: removeMember,
    onSuccess: () => {
      refreshTeam();
      setNotice("Member removed.");
    },
  });
  const dropInvite = useMutation({
    mutationFn: cancelInvitation,
    onSuccess: () => {
      refreshTeam();
      setNotice("Invitation cancelled.");
    },
  });
  const inviteMember = useMutation({
    mutationFn: async (address: string) => {
      const { error: inviteError } = await authClient.organization.inviteMember({
        email: address,
        role: "editor",
        organizationId,
      });
      if (inviteError) {
        throw new Error(inviteError.message ?? "The invitation was not sent.");
      }
    },
    onSuccess: () => {
      refreshTeam();
      setInviteOpen(false);
      setNotice("Invitation sent.");
    },
  });

  const busy =
    inviteMember.isPending ||
    changeRole.isPending ||
    dropMember.isPending ||
    dropInvite.isPending;
  const actionError =
    inviteMember.error ?? changeRole.error ?? dropMember.error ?? dropInvite.error;

  const selected = members?.find((entry) => entry.id === selectedId) ?? null;
  function select(id: string | null): void {
    setSelectedId(id);
    setConfirming(false);
    setNotice(null);
  }

  function openInvite(): void {
    setEmail("");
    setInviteOpen(true);
  }

  function invite(event: FormEvent): void {
    event.preventDefault();
    inviteMember.mutate(email.trim());
  }

  const term = query.trim().toLowerCase();
  const visible = (members ?? []).filter((member) => {
    if (roleFilter !== "" && member.role !== roleFilter) {
      return false;
    }
    if (term === "") {
      return true;
    }
    return `${member.displayName ?? ""} ${member.name} ${member.email}`
      .toLowerCase()
      .includes(term);
  });
  const filtering = term !== "" || roleFilter !== "";

  return (
    <section className={VIEW_CLASSNAME}>
      <Toolbar>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search people…"
          aria-label="Search people"
          className={cn("w-56", TOOLBAR_INPUT_CLASSNAME)}
        />
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as Role | "")}
          aria-label="Filter by role"
          className={TOOLBAR_SELECT_CLASSNAME}
        >
          <option value="">All roles</option>
          {ASSIGNABLE.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {isOwner ? (
          <Button
            className={cn("ml-auto", SMALL_BUTTON_CLASSNAME)}
            onClick={openInvite}
          >
            Invite
          </Button>
        ) : null}
      </Toolbar>

      {filtering ? (
        <FilterSummary
          count={visible.length}
          onClear={() => {
            setQuery("");
            setRoleFilter("");
          }}
        />
      ) : null}

      <Workspace
        view={
          <>
            {membersQuery.isError ? (
              <Alert className="mb-3">
                {messageFor(membersQuery.error, "The team list could not be loaded.")}
              </Alert>
            ) : null}
            {invitationsQuery.isError ? (
              <Alert className="mb-3">
                {messageFor(invitationsQuery.error, "Invitations could not be loaded.")}
              </Alert>
            ) : null}
            {actionError !== null ? (
              <Alert className="mb-3">
                {messageFor(actionError, "That change did not save.")}
              </Alert>
            ) : null}
            {notice ? (
              <Alert tone="success" className="mb-3">
                {notice}
              </Alert>
            ) : null}

            {members === undefined ? (
              <p className="py-8 text-center font-mono text-xs text-muted-foreground">
                Loading the team.
              </p>
            ) : members.length === 0 ? (
              <EmptyState
                title="No one here yet"
                body="Invite a teammate and they will appear here once they accept."
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="Nobody matches"
              />
            ) : (
              <table className={TABLE_CLASSNAME} aria-label="Members">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Member
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Email
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Role
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((member) => (
                    <tr
                      key={member.id}
                      data-selected={selected?.id === member.id}
                      className={TABLE_ROW_CLASSNAME}
                    >
                      <td className={TABLE_CELL_CLASSNAME}>
                        <Button
                          variant="ghost"
                          onClick={() => select(member.id)}
                          className="h-auto justify-start gap-2 px-1 py-0.5 text-xs"
                        >
                          <Avatar
                            name={member.displayName ?? member.name}
                            image={member.image}
                            className="size-5 text-[11px]"
                          />
                          <span className="truncate">
                            {member.displayName ?? member.name}
                          </span>
                          {member.isYou ? (
                            <span className="font-mono text-[11px] text-muted-foreground">
                              you
                            </span>
                          ) : null}
                        </Button>
                      </td>
                      <td
                        className={cn(
                          TABLE_CELL_CLASSNAME,
                          "truncate font-mono text-muted-foreground",
                        )}
                      >
                        {member.email}
                      </td>
                      <td className={TABLE_CELL_CLASSNAME}>{member.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {isOwner && pending.length > 0 ? (
              <div className="mt-8">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Awaiting acceptance
                </h2>
                <ul className="mt-2">
                  {pending.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center gap-3 border-t border-border py-1.5"
                    >
                      <span className="truncate font-mono text-xs">
                        {row.email}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.role}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        expires {new Date(row.expiresAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => dropInvite.mutate(row.id)}
                        className={SMALL_BUTTON_CLASSNAME}
                      >
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        }
        aside={
          selected ? (
            <Inspector title="Member details" onClose={() => select(null)}>

              <PropertyList
                properties={[
                  { label: "Name", value: selected.displayName ?? selected.name },
                  { label: "Email", value: selected.email },
                  { label: "Role", value: selected.role },
                  { label: "This is you", value: selected.isYou ? "Yes" : "No" },
                ]}
              />
              {isOwner && !selected.isYou ? (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="member-role"
                      className="text-xs text-muted-foreground"
                    >
                      Role
                    </label>
                    <select
                      id="member-role"
                      value={selected.role}
                      disabled={busy}
                      onChange={(event) => {
                        changeRole.mutate({
                          memberId: selected.id,
                          role: event.target.value as Role,
                        });
                      }}
                      className={SELECT_CLASSNAME}
                    >
                      {ASSIGNABLE.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  {confirming ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Remove from the team?
                      </span>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => dropMember.mutate(selected.id)}
                        className={cn(SMALL_BUTTON_CLASSNAME, "text-red")}
                      >
                        {dropMember.isPending ? "Removing" : "Confirm"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirming(false)}
                        className={SMALL_BUTTON_CLASSNAME}
                      >
                        Keep
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => setConfirming(true)}
                      className={cn(
                        SMALL_BUTTON_CLASSNAME,
                        "mt-3 text-red",
                      )}
                    >
                      Remove member
                    </Button>
                  )}
                </div>
              ) : null}
            </Inspector>
          ) : null
        }
      />

      {isOwner ? (
        <WorkspaceFooter
          legend={
            <span>
              {pending.length}{" "}
              {pending.length === 1 ? "invitation" : "invitations"} awaiting
              acceptance
            </span>
          }
        />
      ) : null}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md gap-5 rounded-none border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Invite a teammate
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={invite}>
            <FieldGroup>
              <FieldLabel>Email</FieldLabel>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="teammate@example.com"
                required
                className="rounded-none"
              />
            </FieldGroup>
            <DialogFooter className="mt-5 gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setInviteOpen(false)}
                className="rounded-none"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="rounded-none">
                {inviteMember.isPending ? "Sending" : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
