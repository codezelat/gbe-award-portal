export const rolePermissions: Record<string, readonly string[]> = {
  super_admin: ["*"],
  staff: [
    "applications.view",
    "applications.view_all",
    "applications.edit",
    "applications.change_status",
    "applications.approve",
    "applications.reject",
    "applications.release_outcome",
    "payments.view",
    "payments.verify",
    "files.view",
    "files.manage",
    "messages.send",
    "exports.create",
    "applicants.manage",
  ],
  // Existing memberships are treated as staff until their records are edited.
  admin: [],
  reviewer: [],
  finance: [],
  support: [],
};
