export const passwordChecks = (value: string) => {
  const length = value.length >= 8;
  const upper = /[A-Z]/.test(value);
  const number = /[0-9]/.test(value);
  const special = /[!@#$%^&*]/.test(value);
  return { length, upper, number, special };
};

export const passwordStrengthLabel = (value: string) => {
  const checks = passwordChecks(value);
  const score = Object.values(checks).filter(Boolean).length;
  if (score <= 1) return "weak";
  if (score <= 3) return "medium";
  return "strong";
};
