import { fetchNativeResponseWithTimeout as fetch } from "./nativeTimeout";

export const nativePasswordPolicyError = (password: string) => {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character.";
  return null;
};

const breachUnavailableCopy = "We couldn't check this password against known breaches. Please try again.";
const breachFoundCopy = "This password has appeared in a data breach. Choose a different one.";

const rotateLeft = (value: number, shift: number) => (value << shift) | (value >>> (32 - shift));

const utf8Bytes = (value: string) => {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 1) {
    const char = encoded[index];
    if (char === "%") {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return bytes;
};

const sha1Hex = (value: string) => {
  const bytes = utf8Bytes(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push(Math.floor(bitLength / 2 ** shift) & 0xff);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const words = new Array<number>(80).fill(0);
    for (let index = 0; index < 16; index += 1) {
      const offset = chunk + index * 4;
      words[index] = (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      const f = index < 20
        ? (b & c) | (~b & d)
        : index < 40
          ? b ^ c ^ d
          : index < 60
            ? (b & c) | (b & d) | (c & d)
            : b ^ c ^ d;
      const k = index < 20 ? 0x5a827999 : index < 40 ? 0x6ed9eba1 : index < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((word) => word.toString(16).padStart(8, "0")).join("").toUpperCase();
};

export const nativePasswordSecurityError = async (password: string) => {
  const policyError = nativePasswordPolicyError(password);
  if (policyError) return policyError;

  const hash = sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: "GET",
      headers: {
        "Add-Padding": "true",
        "User-Agent": "HuddleNativePasswordSecurity/1.0",
      },
    });
    if (!response.ok) return breachUnavailableCopy;
    const rows = (await response.text()).split(/\r?\n/);
    return rows.some((row) => row.trim().split(":")[0]?.toUpperCase() === suffix) ? breachFoundCopy : null;
  } catch {
    return breachUnavailableCopy;
  }
};
