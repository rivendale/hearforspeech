import { bufferToBase64, base64ToBuffer } from './crypto';

/**
 * Compresses a string using the native Deflate algorithm and returns a Base64-encoded string.
 */
export async function compressData(text: string): Promise<string> {
  if (typeof CompressionStream === 'undefined') {
    // Fallback if not supported (rare in modern modern PWA target browsers)
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(text);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary);
  }

  const encoder = new TextEncoder();
  const inputBytes = encoder.encode(text);
  const stream = new Blob([inputBytes]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('deflate'));
  const response = new Response(compressedStream);
  const buffer = await response.arrayBuffer();
  return bufferToBase64(buffer);
}

/**
 * Decompresses a Base64-encoded Deflate string and returns the original string.
 */
export async function decompressData(base64: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    // Fallback if not supported
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  const buffer = base64ToBuffer(base64);
  const stream = new Blob([buffer]).stream();
  const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate'));
  const response = new Response(decompressedStream);
  return response.text();
}
