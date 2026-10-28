/** SHA-256 özeti, "sha256:<hex>" biçiminde. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', view as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function contentHash(data: ArrayBuffer | Uint8Array): Promise<string> {
  return `sha256:${await sha256Hex(data)}`;
}
