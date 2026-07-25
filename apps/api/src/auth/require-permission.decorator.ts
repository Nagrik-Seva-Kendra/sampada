import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@sampada/shared";

export const PERMISSION_KEY = "requiredPermissions";

/** Route-level metadata consumed by PermissionGuard. Requires ALL listed permissions (AND). */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSION_KEY, permissions);
