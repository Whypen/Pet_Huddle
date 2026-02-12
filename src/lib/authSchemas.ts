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
  const [p1, p2, p3] = value.split("/").map((v) => Number(v));
  if (!p1 || !p2 || !p3) return null;
  let dd = p2;
  let mm = p1;
  const yyyy = p3;
  if (p1 > 12 && p2 <= 12) {
    dd = p1;
    mm = p2;
  }
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

export const dobSchema = z
  .object({
    dob_day: z.string().optional(),
    dob_month: z.string().optional(),
    dob_year: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const { dob_day, dob_month, dob_year } = data;
    if (!dob_day || !dob_month || !dob_year) return;
    const day = dob_day.padStart(2, "0");
    const month = dob_month.padStart(2, "0");
    const assembled = `${dob_year}-${month}-${day}`;
    if (!isValidDate(assembled)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dob_day"], message: "Invalid date" });
      return;
    }
    if (!isNotFuture(assembled)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dob_day"], message: "Date cannot be in future" });
    }
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
