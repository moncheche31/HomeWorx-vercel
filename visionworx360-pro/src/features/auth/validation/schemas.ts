import { z } from "zod";

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

// Allows letters (incl. accented Spanish letters), spaces, apostrophes,
// hyphens, and periods. Leading char must be a letter.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'.\-]{0,49}$/u;

export interface PasswordChecks {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  symbol: boolean;
}

export function checkPassword(v: string): PasswordChecks {
  return {
    length: v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX,
    uppercase: /\p{Lu}/u.test(v),
    lowercase: /\p{Ll}/u.test(v),
    number: /\d/.test(v),
    symbol: /[^\p{L}\p{N}]/u.test(v),
  };
}

export function isPasswordStrong(v: string): boolean {
  const c = checkPassword(v);
  return c.length && c.uppercase && c.lowercase && c.number && c.symbol;
}

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "required")
    .email("invalid_email")
    .max(255, "invalid_email"),
  password: z.string().min(1, "required"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "required")
      .max(50, "invalid_name")
      .regex(NAME_RE, "invalid_name"),
    lastName: z
      .string()
      .trim()
      .min(1, "required")
      .max(50, "invalid_name")
      .regex(NAME_RE, "invalid_name"),
    email: z
      .string()
      .trim()
      .min(1, "required")
      .email("invalid_email")
      .max(255, "invalid_email"),
    password: z
      .string()
      .min(1, "required")
      .max(PASSWORD_MAX, "invalid_password_length")
      .refine(isPasswordStrong, "weak_password"),
    confirmPassword: z.string().min(1, "required"),
    acceptTerms: z.boolean().refine((v) => v === true, { message: "required" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "password_mismatch",
  });
export type RegisterValues = z.infer<typeof registerSchema>;
