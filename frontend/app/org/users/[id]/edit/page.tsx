"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import type { OrgUser } from "@/lib/types";
import { OrgUserForm, USERS_PATH } from "../../user-form";
import { PlanLockNotice, usePlanLocks } from "@/components/billing/locked";
import "../../users.css";

// GET /org/users/:id returns the snake_case safe-user shape (first_name,
// phone_number, …) plus `role`, while the list returns camelCase OrgUser rows.
// Accept either so the form is always prefilled.
type OrgUserResponse = Partial<OrgUser> & {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  must_change_password?: boolean;
  approved_at?: string | null;
  created_at?: string;
};

function toOrgUser(raw: OrgUserResponse): OrgUser {
  return {
    id: raw.id,
    email: raw.email,
    firstName: raw.firstName ?? raw.first_name ?? null,
    lastName: raw.lastName ?? raw.last_name ?? null,
    phoneNumber: raw.phoneNumber ?? raw.phone_number ?? null,
    role: raw.role ?? null,
    status: raw.status ?? "active",
    approvedAt: raw.approvedAt ?? raw.approved_at ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? "",
    mustChangePassword: raw.mustChangePassword ?? raw.must_change_password ?? false,
    hasTeam: raw.hasTeam ?? false,
  };
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="form-alert">
      {children} <Link href={USERS_PATH}>Back to Users</Link>
    </div>
  );
}

export default function EditOrgUserPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { accessToken, isLoading, hasPermission } = useAuth();
  const canEdit = hasPermission("users", "edit");
  // Billing v2: say a paused user can't be brought back from here.
  const paused = usePlanLocks().userPaused(id);

  const [user, setUser] = useState<OrgUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !accessToken || !canEdit) return;
    let cancelled = false;
    apiFetch<OrgUserResponse>(`/org/users/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((u) => {
        if (!cancelled) setUser(toOrgUser(u));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load user.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, accessToken, canEdit]);

  if (isLoading) return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  if (!canEdit) return <Notice>You don&apos;t have permission to edit users.</Notice>;
  if (error) return <Notice>{error}</Notice>;
  if (!user) return <div className="muted" style={{ padding: 24 }}>Loading…</div>;
  // The backend refuses edits to organisation admins; say so up front
  // instead of letting the save fail.
  if (user.role?.key === "admin") return <Notice>Organisation admins can&apos;t be edited here.</Notice>;
  return (
    <>
      {paused ? <PlanLockNotice kind="user_paused" /> : null}
      <OrgUserForm key={user.id} user={user} />
    </>
  );
}
