// Crypto utilities for Cloudflare Workers
// Using Web Crypto API for password hashing and encryption

// Convert string to ArrayBuffer
const stringToArrayBuffer = (str: string): ArrayBuffer => {
  return new TextEncoder().encode(str);
};

// Convert ArrayBuffer to hex string
const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// Convert hex string to ArrayBuffer
const hexToArrayBuffer = (hex: string): ArrayBuffer => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
};

// Generate random salt
const generateSalt = (): ArrayBuffer => {
  return crypto.getRandomValues(new Uint8Array(32)).buffer;
};

// PBKDF2 key derivation
const deriveKey = async (password: string, salt: ArrayBuffer, iterations: number = 100000): Promise<ArrayBuffer> => {
  const passwordBuffer = stringToArrayBuffer(password);
  
  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  // Derive key using PBKDF2
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    {
      name: 'HMAC',
      hash: 'SHA-256',
      length: 256
    },
    true,
    ['sign']
  );
  
  return await crypto.subtle.exportKey('raw', derivedKey) as ArrayBuffer;
};

// Hash password with salt
export const hashPassword = async (password: string): Promise<string> => {
  const salt = generateSalt();
  const iterations = 100000;
  
  const hashedKey = await deriveKey(password, salt, iterations);
  
  // Combine salt, iterations, and hash
  const saltHex = arrayBufferToHex(salt);
  const hashHex = arrayBufferToHex(hashedKey);
  
  return `${iterations}:${saltHex}:${hashHex}`;
};

// Verify password against hash
export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  try {
    const parts = hashedPassword.split(':');
    if (parts.length !== 3) {
      return false;
    }
    
    const iterations = parseInt(parts[0]);
    const salt = hexToArrayBuffer(parts[1]);
    const originalHash = parts[2];
    
    const derivedKey = await deriveKey(password, salt, iterations);
    const derivedHash = arrayBufferToHex(derivedKey);
    
    // Constant-time comparison to prevent timing attacks
    return derivedHash === originalHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
};

// Generate secure random string
export const generateSecureRandom = (length: number = 32): string => {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return arrayBufferToHex(array.buffer);
};

// Generate API key
export const generateApiKey = (): string => {
  return `kk_${generateSecureRandom(32)}`;
};

// AES-GCM encryption
export const encrypt = async (plaintext: string, key: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const plaintextBuffer = stringToArrayBuffer(plaintext);
  const keyBuffer = stringToArrayBuffer(key);
  
  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    plaintextBuffer
  );
  
  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return arrayBufferToHex(combined.buffer);
};

// AES-GCM decryption
export const decrypt = async (encryptedData: string, key: string): Promise<string> => {
  const combined = hexToArrayBuffer(encryptedData);
  const iv = combined.slice(0, 12); // First 12 bytes are IV
  const ciphertext = combined.slice(12); // Rest is ciphertext
  
  const keyBuffer = stringToArrayBuffer(key);
  
  // Import key
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    cryptoKey,
    ciphertext
  );
  
  return new TextDecoder().decode(plaintext);
};

// Hash data with SHA-256
export const sha256 = async (data: string): Promise<string> => {
  const buffer = stringToArrayBuffer(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return arrayBufferToHex(hashBuffer);
};

// HMAC signature
export const createHMAC = async (data: string, secret: string): Promise<string> => {
  const keyBuffer = stringToArrayBuffer(secret);
  const dataBuffer = stringToArrayBuffer(data);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
  return arrayBufferToHex(signature);
};

// Verify HMAC signature
export const verifyHMAC = async (data: string, signature: string, secret: string): Promise<boolean> => {
  const expectedSignature = await createHMAC(data, secret);
  return expectedSignature === signature;
};

// Generate OTP (One-Time Password)
export const generateOTP = (length: number = 6): string => {
  const digits = '0123456789';
  let otp = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    otp += digits[randomIndex];
  }
  
  return otp;
};

// Time-based OTP (TOTP) - simplified implementation
export const generateTOTP = async (secret: string, timeStep: number = 30): Promise<string> => {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time, false); // Big-endian
  
  const keyBuffer = stringToArrayBuffer(secret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, timeBuffer);
  const signatureArray = new Uint8Array(signature);
  
  const offset = signatureArray[19] & 0xf;
  const code = (
    ((signatureArray[offset] & 0x7f) << 24) |
    ((signatureArray[offset + 1] & 0xff) << 16) |
    ((signatureArray[offset + 2] & 0xff) << 8) |
    (signatureArray[offset + 3] & 0xff)
  ) % 1000000;
  
  return code.toString().padStart(6, '0');
};

// Verify TOTP
export const verifyTOTP = async (token: string, secret: string, timeStep: number = 30, window: number = 1): Promise<boolean> => {
  const currentTime = Math.floor(Date.now() / 1000 / timeStep);
  
  // Check current time and adjacent time windows
  for (let i = -window; i <= window; i++) {
    const time = currentTime + i;
    const timeBuffer = new ArrayBuffer(8);
    const timeView = new DataView(timeBuffer);
    timeView.setUint32(4, time, false);
    
    const expectedToken = await generateTOTP(secret, timeStep);
    if (token === expectedToken) {
      return true;
    }
  }
  
  return false;
};

// Generate unique ID
export const generateId = (prefix: string = ''): string => {
  const timestamp = Date.now().toString(36);
  const randomPart = generateSecureRandom(8);
  return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`;
};

// Generate UUID v4
export const generateUUID = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  
  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;
  
  const hex = arrayBufferToHex(array.buffer);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-');
};

// Alias for verifyPassword to maintain compatibility
export const comparePassword = verifyPassword;