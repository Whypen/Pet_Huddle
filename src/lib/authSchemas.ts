import { z } from "zod";

const parseDob = (value: string) => {
  if (!value) return null;
  if (value.includes("-")) {
    const [yyyy, mm, dd] = value.split("-").map((v) => Number(v));
    if (!mm || !dd || !yyyy) return null;
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
    return d;
  }
  const [mm, dd, yyyy] = value.split("/").map((v) => Number(v));
  if (!mm || !dd || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
};

export const isValidDate = (value: string) => {
  const d = parseDob(value);
  if (!d) return false;
  const year = d.getFullYear();
  return year >= 1900 && year <= 3000;
};

export const isNotFuture = (value: string) => {
  const d = parseDob(value);
  if (!d) return false;
  return d.getTime() <= Date.now();
};

export const isAtLeast16 = (value: string) => {
  const d = parseDob(value);
  if (!d) return false;
  const now = new Date();
  const years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  const age = m < 0 || (m === 0 && now.getDate() < d.getDate()) ? years - 1 : years;
  return age >= 16;
};

export const dobSchema = z.object({
  dob: z
    .string()
    .refine(isValidDate, "Invalid date")
    .refine(isNotFuture, "Date cannot be in future")
    .refine(isAtLeast16, "Must be at least 16 years old"),
});

export const nameSchema = z.object({
  display_name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(30, "Name must be less than 30 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Only letters, spaces, hyphens, and apostrophes allowed"),
});

export const credentialsSchema = z
  .object({
    email: z.string().email("Invalid email format"),
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid phone format"),
    password: z
      .string()
      .min(8, "Minimum 8 characters")
      .regex(/[A-Z]/, "Must include uppercase letter")
      .regex(/[0-9]/, "Must include number")
      .regex(/[!@#$%^&*]/, "Must include special character"),
    confirmPassword: z.string(),
    agreedToTerms: z.literal(true, {
      errorMap: () => ({ message: "You must agree to continue" }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const verifySchema = z.object({
  legal_name: z.string().min(2).max(50).optional(),
});
