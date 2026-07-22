import { z } from "zod";
import { StaffRole } from "./enums.js";

/** Admin creates employee accounts; employees can also self-signup (see EmployeesController). */
export const CreateEmployeeInput = z.object({
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeInput>;

/** Public self-signup: same as CreateEmployeeInput plus a chosen username and a verified-email OTP. */
export const EmployeeSignupInput = CreateEmployeeInput.extend({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only"),
  emailOtp: z.string().trim().length(6, "Enter the 6-digit code"),
});
export type EmployeeSignupInput = z.infer<typeof EmployeeSignupInput>;

/**
 * Admin creates a staff account from the "Manage Team → User Management" tab.
 * Unlike self-signup there's no OTP; the admin picks the role (employee or
 * another admin) and may assign a login username up front (optional — the
 * account stays usable via email until one is set). Immediately ACTIVE.
 */
export const CreateUserInput = z.object({
  fname: z.string().trim().min(1).max(100),
  lname: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number"),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only")
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: StaffRole,
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

/**
 * Admin edits an existing staff account from User Management. Every field is
 * optional — only what the admin changes is sent. A non-empty `password`
 * resets the login password (no current-password check; admin authority).
 */
export const UpdateUserInput = z.object({
  fname: z.string().trim().min(1).max(100).optional(),
  lname: z.string().trim().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Enter a valid 10-digit mobile number").optional(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, dot, underscore, hyphen only")
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  role: StaffRole.optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

/** Employee as listed to the admin (passwords are never exposed — hashes are write-only). */
export const EmployeeItem = z.object({
  id: z.string(),
  employeeCode: z.string().nullable(),
  fname: z.string(),
  lname: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  username: z.string().nullable(),
  createdAt: z.string(),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE"]),
  /** EMPLOYEE or ADMIN — lets the User Management list badge admin accounts. */
  role: StaffRole,
});
export type EmployeeItem = z.infer<typeof EmployeeItem>;
