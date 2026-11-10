/** Decodes the manifest's base64 tile bitsets. */
export function decodeBitset(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Bit `i`, LSB-first within each byte. Out of range reads as unset. */
export function bitAt(bits: Uint8Array, i: number): boolean {
  if (i < 0) return false;
  const byte = i >> 3;
  if (byte >= bits.length) return false;
  return ((bits[byte] >> (i & 7)) & 1) === 1;
}
