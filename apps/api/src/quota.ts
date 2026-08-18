export type AccountRole = "user" | "admin";

/** Admins are exempt; zero or negative limits keep the existing unlimited behavior. */
export function exceedsProjectQuota(projectCount: number, projectLimit: number, role: AccountRole | null): boolean {
  return projectLimit > 0 && projectCount >= projectLimit && role !== "admin";
}
