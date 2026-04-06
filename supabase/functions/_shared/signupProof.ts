const SIGNUP_PROOF_TTL_MS = 30 * 60 * 1000;

export type PresignupTokenRow = {
  token: string;
  email: string;
  verified: boolean;
  expires_at: string;
  signup_proof: string | null;
  signup_proof_issued_at: string | null;
  signup_proof_expires_at: string | null;
  signup_proof_used_at: string | null;
};

const isExpired = (iso: string | null | undefined) => {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
};

export const hasUsableSignupProof = (row: PresignupTokenRow) =>
  Boolean(row.signup_proof) &&
  !row.signup_proof_used_at &&
  !isExpired(row.signup_proof_expires_at);

export const readPresignupTokenRow = async (
  supabase: {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: PresignupTokenRow | null; error: { message?: string } | null }>;
        };
      };
    };
  },
  token: string,
) => {
  const { data, error } = await supabase
    .from("presignup_tokens")
    .select("token,email,verified,expires_at,signup_proof,signup_proof_issued_at,signup_proof_expires_at,signup_proof_used_at")
    .eq("token", token)
    .maybeSingle();

  return { data, error };
};

export const ensureSignupProof = async (
  supabase: {
    from: (table: string) => {
      update: (values: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    };
  },
  row: PresignupTokenRow,
) => {
  if (!row.verified) return { proof: null, expires_at: null, reason: "not_verified" as const };
  if (isExpired(row.expires_at)) return { proof: null, expires_at: null, reason: "token_expired" as const };
  if (row.signup_proof_used_at) return { proof: null, expires_at: null, reason: "proof_used" as const };
  if (hasUsableSignupProof(row)) {
    return {
      proof: String(row.signup_proof),
      expires_at: String(row.signup_proof_expires_at),
      reason: null,
    };
  }

  const proof = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SIGNUP_PROOF_TTL_MS).toISOString();

  const { error } = await supabase
    .from("presignup_tokens")
    .update({
      signup_proof: proof,
      signup_proof_issued_at: issuedAt,
      signup_proof_expires_at: expiresAt,
      signup_proof_used_at: null,
    })
    .eq("token", row.token);

  if (error) {
    return { proof: null, expires_at: null, reason: "issue_failed" as const, error };
  }

  return { proof, expires_at: expiresAt, reason: null };
};
