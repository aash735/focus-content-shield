/**
 * Security & Crypto Utilities
 * Secure client-side password/PIN hashing and verification.
 * Uses Web Crypto API (crypto.subtle) with salt. Never stores plaintext PINs.
 */

export class CryptoUtils {
  /**
   * Generates a random hex salt (16 bytes = 32 hex chars)
   */
  static generateSalt() {
    const array = new Uint8Array(16);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(array);
    } else {
      // Fallback pseudo-random for legacy contexts
      for (let i = 0; i < 16; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Hashes a PIN or password with a salt using SHA-256.
   * Returns hex representation of hash string.
   */
  static async hashPin(pin, salt) {
    if (!pin || typeof pin !== 'string') return null;
    const cleanPin = pin.trim();
    if (!cleanPin) return null;

    const data = new TextEncoder().encode(cleanPin + ':' + (salt || ''));

    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Node fallback for unit test runner if subtle is absent
      const nodeCrypto = await import('node:crypto');
      return nodeCrypto.createHash('sha256').update(cleanPin + ':' + (salt || '')).digest('hex');
    }
  }

  /**
   * Verifies a candidate PIN against a stored hash and salt.
   */
  static async verifyPin(candidatePin, storedHash, salt) {
    if (!candidatePin || !storedHash || !salt) return false;
    const computedHash = await this.hashPin(candidatePin, salt);
    return computedHash === storedHash;
  }
}

export default CryptoUtils;
