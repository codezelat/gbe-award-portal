import { rolePermissions } from "@/config/permissions";

export function hasPermission(
  membership: { role: string; permissions: unknown },
  permission: string,
) {
  if (membership.role === "super_admin") return true;
  if (rolePermissions[membership.role]?.includes("*")) return true;
  const overrides = membership.permissions as Record<string, boolean>;
  if (overrides?.[permission] === false) return false;
  return overrides?.[permission] === true || rolePermissions[membership.role]?.includes(permission) === true;
}
