export const passwordChecks = (value: string) => {
  const length = value.length >= 8;
  const upper = /[A-Z]/.test(value);
  const number = /[0-9]/.test(value);
  const special = /[^A-Za-z0-9]/.test(value);
  return { length, upper, number, special };
};

export const passwordStrengthLabel = (value: string) => {
  const checks = passwordChecks(value);
  const score = Object.values(checks).filter(Boolean).length;
  if (score <= 1) return "weak";
  if (score <= 3) return "medium";
  return "strong";
};

export const passwordPolicyError = (value: string) => {
  const checks = passwordChecks(value);
  if (!checks.length) return "Password must be at least 8 characters.";
  if (!checks.upper) return "Password must include an uppercase letter.";
  if (!checks.number) return "Password must include a number.";
  if (!checks.special) return "Password must include a special character.";
  return null;
};
