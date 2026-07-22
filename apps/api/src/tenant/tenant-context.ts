/** Identity + tenant context carried for the lifetime of a single request. */
export interface TenantContext {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: "OWNER" | "ADMIN" | "EMPLOYEE";
}

/** CLS key under which the tenant context lives for the request. */
export const TENANT_KEY = "tenant";
