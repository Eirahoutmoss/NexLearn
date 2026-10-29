/** Dosyayı kullanıcının cihazına indirir (ağ isteği yok; yerel Blob bağlantısı). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  // Açık bir modal varken sayfanın geri kalanı "inert" olur; bağlantı en üstteki pencereye eklenir.
  const host = Array.from(document.querySelectorAll('dialog[open]')).pop() ?? document.body;
  host.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(text: string, fileName: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName);
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/octet-stream'): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), fileName);
}
