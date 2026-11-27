// Stable JSON for checksums: object keys sorted at every level, no whitespace.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 hex digest of a string. Supplied by the caller (platform) to keep rules/ pure. */
export type Hasher = (text: string) => Promise<string>;

export async function checksumOf(value: unknown, hash: Hasher): Promise<string> {
  return `sha256:${await hash(canonicalJson(value))}`;
}

/** Short form shown to people for comparing copies by eye. */
export const fingerprint = (checksum: string): string => checksum.replace(/^sha256:/, "").slice(0, 8);
