import { z } from "zod";

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

/** Employee as listed to the admin (never exposes the password hash). */
export const EmployeeItem = z.object({
  id: z.string(),
  fname: z.string(),
  lname: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  username: z.string().nullable(),
  createdAt: z.string(),
  status: z.enum(["PENDING", "ACTIVE"]),
});
export type EmployeeItem = z.infer<typeof EmployeeItem>;
