import { db, type SessionLog, type Recording } from '../db/database';

// --- Base64 and Buffer Codecs ---
export const bufferToBase64 = (buffer: ArrayBuffer | ArrayBufferView): string => {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : ArrayBuffer.isView(buffer)
      ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

export const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
};

export const base64ToBlob = (base64: string, mimeType: string = 'audio/webm'): Blob => {
  return new Blob([base64ToBuffer(base64)], { type: mimeType });
};

// --- SHA-256 PIN Hashing ---
export const hashPIN = async (pin: string): Promise<string> => {
  const msgUint8 = new TextEncoder().encode(pin + "hfs_salt_2026");
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- PBKDF2 Key Derivation ---
export async function deriveKeyFromPin(pin: string, salt: ArrayBuffer | ArrayBufferView): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// --- Symmetric Encryption & Decryption Helpers ---
export async function encryptString(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string, iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  return {
    ciphertext: bufferToBase64(encrypted),
    iv: bufferToBase64(iv)
  };
}

export async function decryptString(ciphertextBase64: string, ivBase64: string, key: CryptoKey): Promise<string> {
  const decoder = new TextDecoder();
  const ciphertext = base64ToBuffer(ciphertextBase64);
  const iv = base64ToBuffer(ivBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return decoder.decode(decrypted);
}

export async function encryptBlob(blob: Blob, key: CryptoKey): Promise<{ encryptedBlob: Blob, iv: string }> {
  const arrayBuffer = await blob.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    arrayBuffer
  );
  return {
    encryptedBlob: new Blob([encrypted], { type: blob.type }),
    iv: bufferToBase64(iv)
  };
}

export async function decryptBlob(encryptedBlob: Blob, ivBase64: string, key: CryptoKey): Promise<Blob> {
  const arrayBuffer = await encryptedBlob.arrayBuffer();
  const iv = base64ToBuffer(ivBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    arrayBuffer
  );
  return new Blob([decrypted], { type: encryptedBlob.type });
}

// --- Session Log Record Encryption ---
export async function encryptSessionLog(log: SessionLog, key: CryptoKey): Promise<SessionLog> {
  if (log.isEncrypted) return log;

  const encrypted: SessionLog = { ...log, isEncrypted: true };

  if (log.notes) {
    const { ciphertext, iv } = await encryptString(log.notes, key);
    encrypted.notes = ciphertext;
    encrypted.notesIv = iv;
  }

  return encrypted;
}

export async function decryptSessionLog(log: SessionLog, key: CryptoKey): Promise<SessionLog> {
  if (!log.isEncrypted) return log;

  const decrypted: SessionLog = { ...log, isEncrypted: false };

  if (log.notes && log.notesIv) {
    try {
      decrypted.notes = await decryptString(log.notes, log.notesIv, key);
      decrypted.notesIv = undefined;
    } catch (err) {
      console.error("Failed to decrypt notes for log:", log.id, err);
    }
  }

  return decrypted;
}

// --- Recording Record Encryption ---
export async function encryptRecording(rec: Recording, key: CryptoKey): Promise<Recording> {
  if (rec.isEncrypted) return rec;

  const encrypted: Recording = { ...rec, isEncrypted: true };

  if (rec.audio) {
    const { encryptedBlob, iv } = await encryptBlob(rec.audio, key);
    encrypted.audio = encryptedBlob;
    encrypted.audioIv = iv;
  }

  return encrypted;
}

export async function decryptRecording(rec: Recording, key: CryptoKey): Promise<Recording> {
  if (!rec.isEncrypted) return rec;

  const decrypted: Recording = { ...rec, isEncrypted: false };

  if (rec.audio && rec.audioIv) {
    try {
      decrypted.audio = await decryptBlob(rec.audio, rec.audioIv, key);
      decrypted.audioIv = undefined;
    } catch (err) {
      console.error("Failed to decrypt recording audio:", rec.id, err);
    }
  }

  return decrypted;
}

// --- Database Migration Runner ---
export async function toggleDatabaseEncryption(encrypt: boolean, masterKey: CryptoKey) {
  await db.transaction('rw', [db.logs, db.recordings], async () => {
    // 1. Migrate logs
    const allLogs = await db.logs.toArray();
    for (const log of allLogs) {
      if (encrypt && !log.isEncrypted) {
        const encryptedLog = await encryptSessionLog(log, masterKey);
        await db.logs.put(encryptedLog);
      } else if (!encrypt && log.isEncrypted) {
        const decryptedLog = await decryptSessionLog(log, masterKey);
        await db.logs.put(decryptedLog);
      }
    }

    // 2. Migrate recordings
    const allRecs = await db.recordings.toArray();
    for (const rec of allRecs) {
      if (encrypt && !rec.isEncrypted) {
        const encryptedRec = await encryptRecording(rec, masterKey);
        await db.recordings.put(encryptedRec);
      } else if (!encrypt && rec.isEncrypted) {
        const decryptedRec = await decryptRecording(rec, masterKey);
        await db.recordings.put(decryptedRec);
      }
    }
  });
}
