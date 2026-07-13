import { rolePermissions } from "@/config/permissions";

export function hasPermission(
  membership: { role: string; permissions: unknown },
  permission: string,
) {
  if (membership.role === "super_admin") return true;
  const role = ["admin", "reviewer", "finance", "support"].includes(
    membership.role,
  )
    ? "staff"
    : membership.role;
  if (rolePermissions[role]?.includes("*")) return true;
  const overrides = membership.permissions as Record<string, boolean>;
  if (overrides?.[permission] === false) return false;
  return (
    overrides?.[permission] === true ||
    rolePermissions[role]?.includes(permission) === true
  );
}
