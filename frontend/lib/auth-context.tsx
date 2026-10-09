"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "./api";
import type {
  AuthTokens,
  LoginInput,
  LoginResponse,
  PermissionAction,
  Permissions,
  SafeOrganisation,
  SafeUser,
  SessionUser,
  SignupInput,
  SignupResponse,
  UserRole,
} from "./types";
import {
  dashboardPathFor,
  findMockAccount,
} from "./mock/sessions";
import { isOrgAdmin as isOrgAdminSession } from "./session";
import { sessionRoleFromKeys, sessionRoleFromStoredToken } from "./role-session";

const STORAGE_KEYS = {
  accessToken: "be.access_token",
  refreshToken: "be.refresh_token",
  user: "be.user",
} as const;

// Modules where Super Admin's Organisation roles setting for the Admin role is
// enforced for the Org Admin too (see RequirePermission `enforceForOrgAdmin`).
const ORG_ADMIN_ENFORCED_MODULES: ReadonlySet<string> = new Set([
  "dashboard",
  "users",
  "landing_pages",
  "templates",
  "projects",
  "forms",
  "settings",
  "support",
  "roles_permissions",
  "team_chat",
]);

interface AuthContextValue {
  user: SessionUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isMock: boolean;
  login: (input: LoginInput) => Promise<SessionUser>;
  loginWithGoogle: (response: {
    user: SafeUser;
    access_token: string;
    refresh_token: string;
    roles?: string[];
    onboarding_incomplete?: boolean;
  }) => Promise<SessionUser>;
  signup: (input: SignupInput) => Promise<SessionUser>;
  // Persists a session from a SafeUser + token pair returned by any of the
  // signup-wizard step endpoints (Step 1, resume, Step 2's reissue) —
  // those aren't full logins, but they hand back a real session the same
  // way login() does, so the wizard reuses this instead of duplicating
  // toSessionUser/persist logic itself.
  applyAuthTokens: (safeUser: SafeUser, tokens: AuthTokens) => SessionUser;
  logout: () => Promise<void>;
  mockLogin: (
    role: UserRole,
    email: string,
    password: string,
  ) => Promise<void>;
  hasPermission: (module: string, action: PermissionAction) => boolean;
  isOrgAdmin: () => boolean;
  refreshPermissions: () => Promise<Permissions | null>;
  updateOrganisation: (org: Partial<SafeOrganisation>) => void;
  // Settings > My profile saved — keep the header/sidebar name in sync.
  updateProfile: (profile: Partial<Pick<SessionUser, "first_name" | "last_name" | "phone_number">>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): {
  accessToken: string | null;
  user: SessionUser | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, user: null };
  }

  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  const rawUser = localStorage.getItem(STORAGE_KEYS.user);

  if (!accessToken || !refreshToken || !rawUser) {
    return { accessToken: null, user: null };
  }

  try {
    const parsed = JSON.parse(rawUser) as SessionUser;
    if (!parsed.role) {
      return { accessToken: null, user: null };
    }
    return { accessToken, user: parsed };
  } catch {
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.user);
    return { accessToken: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = readStoredSession();
    setUser(stored.user);
    setAccessToken(stored.accessToken);
    setIsLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback(
    (user: SessionUser, accessToken: string, refreshToken: string) => {
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
      localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
      localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
      setUser(user);
      setAccessToken(accessToken);
    },
    [],
  );

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    setUser(null);
    setAccessToken(null);
  }, []);

  const toSessionUser = useCallback(
    (
      safeUser: SafeUser,
      permissions: Permissions,
      roleKeys?: string[],
      platformUnrestricted?: boolean,
    ): SessionUser => {
      const mapped = sessionRoleFromKeys(
        roleKeys,
        safeUser.org_id,
        safeUser.onboarding_step,
      );
      const keys = roleKeys ?? [];
      return {
        ...safeUser,
        role: mapped.role,
        roleLabel: mapped.roleLabel,
        permissions,
        organisation: null,
        roleKeys: keys,
        platformUnrestricted:
          platformUnrestricted ?? keys.includes("super_admin"),
      };
    },
    [],
  );

  const login = useCallback(
    async (input: LoginInput) => {
      const response = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          host: typeof window !== "undefined" ? window.location.host : undefined,
        }),
      });

      let permissions: Permissions = {};
      let roleKeys = response.roles ?? [];
      let platformUnrestricted = roleKeys.includes("super_admin");

      if (
        !response.user.org_id &&
        response.user.onboarding_step === "completed"
      ) {
        try {
          const meRes = await apiFetch<{
            permissions: Permissions;
            unrestricted?: boolean;
            roles?: { key: string; name: string }[];
          }>("/admin/platform-roles/me", {
            headers: { Authorization: `Bearer ${response.access_token}` },
          });
          if (meRes.permissions) permissions = meRes.permissions;
          if (typeof meRes.unrestricted === "boolean") {
            platformUnrestricted = meRes.unrestricted;
          }
          if (meRes.roles?.length) {
            roleKeys = meRes.roles.map((r) => r.key);
            if (roleKeys.includes("super_admin")) platformUnrestricted = true;
          }
        } catch {
          permissions = {};
        }
      } else if (
        response.user.org_id &&
        response.user.onboarding_step === "completed" &&
        !response.onboarding_incomplete
      ) {
        try {
          const meRes = await apiFetch<{
            permissions: Permissions;
            role?: string | null;
            roleName?: string | null;
            roles?: string[];
          }>("/org/permissions/me", {
            headers: { Authorization: `Bearer ${response.access_token}` },
          });
          if (meRes.permissions) {
            permissions = meRes.permissions;
          }
          if (meRes.roles?.length) roleKeys = meRes.roles;
          else if (meRes.role) roleKeys = [meRes.role];
        } catch {
          permissions = {};
        }
      }

      const session = toSessionUser(
        response.user,
        permissions,
        roleKeys,
        platformUnrestricted,
      );
      if (!response.onboarding_incomplete && session.role !== "super_admin") {
        session.onboarding_step = "completed";
      }
      persist(session, response.access_token, response.refresh_token);
      return session;
    },
    [persist, toSessionUser],
  );

  const loginWithGoogle = useCallback(
    async (response: {
      user: SafeUser;
      access_token: string;
      refresh_token: string;
      roles?: string[];
      onboarding_incomplete?: boolean;
    }) => {
      let permissions: Permissions = {};
      let roleKeys = response.roles ?? [];
      let platformUnrestricted = roleKeys.includes("super_admin");

      if (
        !response.user.org_id &&
        response.user.onboarding_step === "completed"
      ) {
        try {
          const meRes = await apiFetch<{
            permissions: Permissions;
            unrestricted?: boolean;
            roles?: { key: string; name: string }[];
          }>("/admin/platform-roles/me", {
            headers: { Authorization: `Bearer ${response.access_token}` },
          });
          if (meRes.permissions) permissions = meRes.permissions;
          if (typeof meRes.unrestricted === "boolean") {
            platformUnrestricted = meRes.unrestricted;
          }
          if (meRes.roles?.length) {
            roleKeys = meRes.roles.map((r) => r.key);
            if (roleKeys.includes("super_admin")) platformUnrestricted = true;
          }
        } catch {
          permissions = {};
        }
      } else if (
        response.user.org_id &&
        response.user.onboarding_step === "completed" &&
        !response.onboarding_incomplete
      ) {
        try {
          const meRes = await apiFetch<{
            permissions: Permissions;
            role?: string | null;
            roleName?: string | null;
            roles?: string[];
          }>("/org/permissions/me", {
            headers: { Authorization: `Bearer ${response.access_token}` },
          });
          if (meRes.permissions) {
            permissions = meRes.permissions;
          }
          if (meRes.roles?.length) roleKeys = meRes.roles;
          else if (meRes.role) roleKeys = [meRes.role];
        } catch {
          permissions = {};
        }
      }

      const session = toSessionUser(
        response.user,
        permissions,
        roleKeys,
        platformUnrestricted,
      );
      if (!response.onboarding_incomplete && session.role !== "super_admin") {
        session.onboarding_step = "completed";
      }
      persist(session, response.access_token, response.refresh_token);
      return session;
    },
    [persist, toSessionUser],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const response = await apiFetch<SignupResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(input),
      });
      // Pending approval — no tokens, do not persist session
      if (response.pending || !response.access_token || !response.refresh_token) {
        // Return a session-like value but without persisting; caller should handle pending
        const session = toSessionUser(response.user, {});
        // Attach pending flag for UI handling by throwing a special error shape is not needed; just return with pending flag
        (session as any).pending = true;
        return session;
      }
      const session = toSessionUser(response.user, {});
      persist(session, response.access_token, response.refresh_token);
      return session;
    },
    [persist, toSessionUser],
  );

  const applyAuthTokens = useCallback(
    (safeUser: SafeUser, tokens: AuthTokens) => {
      const session = toSessionUser(safeUser, {
        dashboard: { view: true },
        settings: { view: true, edit: true },
      }, ["admin"]);
      persist(session, tokens.access_token, tokens.refresh_token);
      return session;
    },
    [persist, toSessionUser],
  );

  const mockLogin = useCallback(
    async (role: UserRole, email: string, password: string) => {
      const account = findMockAccount(email, role);
      if (!account || account.password !== password) {
        throw new Error(
          "Invalid credentials. Use one of the demo accounts shown below.",
        );
      }
      const sessionUser = account.buildUser();
      persist(sessionUser, `mock-access-${sessionUser.id}`, `mock-refresh-${sessionUser.id}`);
    },
    [persist],
  );

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
    if (refreshToken && !refreshToken.startsWith("mock-refresh-")) {
      try {
        await apiFetch("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Ignore logout API failures — always clear the local session.
      }
    }
    clearSession();
  }, [clearSession]);

  const hasPermission = useCallback(
    (module: string, action: PermissionAction) => {
      if (!user) return false;
      if (!user.org_id) {
        if (
          user.platformUnrestricted ||
          user.roleKeys?.includes("super_admin")
        ) {
          return true;
        }
        const perms = user.permissions ?? {};
        const loaded = Object.keys(perms).length > 0;
        if (loaded) {
          if (perms[module]?.[action] === true) return true;
          // Stale sessions may lack newly added modules (e.g. admin_leads).
          // If every known admin_* module is fully granted, treat as unrestricted.
          const adminKeys = Object.keys(perms).filter((k) => k.startsWith("admin_"));
          if (
            adminKeys.length >= 8 &&
            adminKeys.every((k) => perms[k]?.view === true)
          ) {
            return true;
          }
          return false;
        }
        return user.role === "super_admin";
      }
      if (isOrgAdminSession()) {
        // Org Admin is unrestricted except for modules Super Admin governs for
        // the Admin role (mirrors the backend's `enforceForOrgAdmin`). If the
        // module hasn't loaded yet, keep the Admin's full access.
        const adminPerm = user.permissions?.[module];
        if (!ORG_ADMIN_ENFORCED_MODULES.has(module) || !adminPerm) return true;
        return adminPerm[action] === true;
      }
      return user.permissions?.[module]?.[action] === true;
    },
    [user],
  );

  const refreshPermissions = useCallback(async (): Promise<Permissions | null> => {
    const currentUser = userRef.current;
    if (currentUser?.onboarding_step && currentUser.onboarding_step !== "completed") return null;

    const token = accessToken ?? (typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEYS.accessToken) : null);
    if (!token || token.startsWith("mock-access-")) return null;

    const applyPermissions = (
      next: Permissions,
      extras?: { unrestricted?: boolean; roleKeys?: string[] },
    ) => {
      setUser((prev) => {
        if (!prev) return null;
        const nextUnrestricted =
          extras?.unrestricted ??
          extras?.roleKeys?.includes("super_admin") ??
          prev.platformUnrestricted;
        const nextKeys = extras?.roleKeys ?? prev.roleKeys;
        if (
          JSON.stringify(prev.permissions ?? {}) === JSON.stringify(next) &&
          prev.platformUnrestricted === nextUnrestricted &&
          JSON.stringify(prev.roleKeys ?? []) === JSON.stringify(nextKeys ?? [])
        ) {
          return prev;
        }
        const updated: SessionUser = {
          ...prev,
          permissions: next,
          platformUnrestricted: nextUnrestricted,
          roleKeys: nextKeys,
        };
        try {
          localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        return updated;
      });
      return next;
    };

    if (currentUser && !currentUser.org_id) {
      try {
        const meRes = await apiFetch<{
          permissions: Permissions;
          unrestricted?: boolean;
          roles?: { key: string; name: string }[];
        }>("/admin/platform-roles/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes?.permissions) {
          return applyPermissions(meRes.permissions, {
            unrestricted: meRes.unrestricted,
            roleKeys: meRes.roles?.map((r) => r.key),
          });
        }
      } catch {
        return null;
      }
      return null;
    }

    try {
      const meRes = await apiFetch<{ permissions: Permissions }>("/org/permissions/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes?.permissions) {
        setUser((prev) => {
          if (!prev) return null;
          const mapped = sessionRoleFromStoredToken(prev.org_id, prev.onboarding_step);
          if (
            JSON.stringify(prev.permissions ?? {}) === JSON.stringify(meRes.permissions) &&
            prev.role === mapped.role
          ) {
            return prev;
          }
          const updated = {
            ...prev,
            permissions: meRes.permissions,
            role: mapped.role,
            roleLabel: mapped.roleLabel,
          };
          try {
            localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updated));
          } catch {
            /* ignore */
          }
          return updated;
        });
        return meRes.permissions;
      }
    } catch {
      // ignore
    }
    return null;
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void refreshPermissions();

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshPermissions();
      }
    };
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    const interval = setInterval(() => {
      void refreshPermissions();
    }, 45000);

    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      clearInterval(interval);
    };
  }, [accessToken, refreshPermissions]);

  const isOrgAdmin = useCallback((): boolean => {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    return isOrgAdminSession();
  }, [user]);

  const updateOrganisation = useCallback(
    (orgUpdate: Partial<SafeOrganisation>) => {
      setUser((prev) => {
        if (!prev) return null;
        const updatedOrg = prev.organisation
          ? { ...prev.organisation, ...orgUpdate }
          : ({ ...orgUpdate } as SafeOrganisation);
        const updatedUser: SessionUser = {
          ...prev,
          organisation: updatedOrg,
        };
        try {
          localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updatedUser));
        } catch {
          /* ignore */
        }
        return updatedUser;
      });
    },
    [],
  );

  const updateProfile = useCallback(
    (profile: Partial<Pick<SessionUser, "first_name" | "last_name" | "phone_number">>) => {
      setUser((prev) => {
        if (!prev) return null;
        const updatedUser: SessionUser = { ...prev, ...profile };
        try {
          localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(updatedUser));
        } catch {
          /* ignore */
        }
        return updatedUser;
      });
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isLoading,
      isMock: true,
      login,
      loginWithGoogle,
      signup,
      applyAuthTokens,
      logout,
      mockLogin,
      hasPermission,
      isOrgAdmin,
      refreshPermissions,
      updateOrganisation,
      updateProfile,
    }),
    [
      user,
      accessToken,
      isLoading,
      login,
      loginWithGoogle,
      signup,
      applyAuthTokens,
      logout,
      mockLogin,
      hasPermission,
      isOrgAdmin,
      refreshPermissions,
      updateOrganisation,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useDashboardPath() {
  const { user, isLoading } = useAuth();
  const path = user ? dashboardPathFor(user.role) : "/login";
  return { path, user, isLoading };
}