// JWT utilities for Cloudflare Workers
// Using Web Crypto API for JWT operations

interface JWTHeader {
  alg: string;
  typ: string;
}

interface JWTPayload {
  sub: string; // Subject (user ID)
  email: string;
  role: string;
  verified: boolean;
  iat: number; // Issued at
  exp: number; // Expiration
  iss?: string; // Issuer
  aud?: string; // Audience
  type?: 'access' | 'refresh' | 'password_reset' | 'email_verification';
}

// Base64 URL encode
const base64UrlEncode = (data: ArrayBuffer): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// Base64 URL decode
const base64UrlDecode = (str: string): ArrayBuffer => {
  // Add padding if needed
  str += '='.repeat((4 - (str.length % 4)) % 4);
  // Replace URL-safe characters
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

// Convert string to ArrayBuffer
const stringToArrayBuffer = (str: string): ArrayBuffer => {
  return new TextEncoder().encode(str);
};

// Convert ArrayBuffer to string
const arrayBufferToString = (buffer: ArrayBuffer): string => {
  return new TextDecoder().decode(buffer);
};

// Import HMAC key
const importHMACKey = async (secret: string): Promise<CryptoKey> => {
  return await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

// Generate JWT token
export const generateJWT = async (
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: number = 24 * 60 * 60 // 24 hours in seconds
): Promise<string> => {
  const header: JWTHeader = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    iss: 'klear-karma-api',
    aud: 'klear-karma-app'
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(stringToArrayBuffer(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(stringToArrayBuffer(JSON.stringify(fullPayload)));

  // Create signature
  const data = `${encodedHeader}.${encodedPayload}`;
  const key = await importHMACKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, stringToArrayBuffer(data));
  const encodedSignature = base64UrlEncode(signature);

  return `${data}.${encodedSignature}`;
};

// Verify JWT token
export const verifyJWT = async (token: string, secret: string): Promise<JWTPayload> => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // Verify signature
  const data = `${encodedHeader}.${encodedPayload}`;
  const key = await importHMACKey(secret);
  const signature = base64UrlDecode(encodedSignature);
  
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    stringToArrayBuffer(data)
  );

  if (!isValid) {
    throw new Error('Invalid JWT signature');
  }

  // Decode and validate payload
  const payloadBuffer = base64UrlDecode(encodedPayload);
  const payload: JWTPayload = JSON.parse(arrayBufferToString(payloadBuffer));

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('JWT token has expired');
  }

  // Check issued at (not in the future)
  if (payload.iat && payload.iat > now + 60) { // Allow 60 seconds clock skew
    throw new Error('JWT token issued in the future');
  }

  return payload;
};

// Decode JWT without verification (for debugging)
export const decodeJWT = (token: string): { header: JWTHeader; payload: JWTPayload } => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [encodedHeader, encodedPayload] = parts;

  const headerBuffer = base64UrlDecode(encodedHeader);
  const payloadBuffer = base64UrlDecode(encodedPayload);

  const header: JWTHeader = JSON.parse(arrayBufferToString(headerBuffer));
  const payload: JWTPayload = JSON.parse(arrayBufferToString(payloadBuffer));

  return { header, payload };
};

// Generate refresh token (longer expiration)
export const generateRefreshToken = async (
  userId: string,
  secret: string
): Promise<string> => {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    type: 'refresh',
    email: '', // Not needed for refresh tokens
    role: '',
    verified: false
  };

  return generateJWT(payload, secret, 30 * 24 * 60 * 60); // 30 days
};

// Verify refresh token
export const verifyRefreshToken = async (token: string, secret: string): Promise<string> => {
  const payload = await verifyJWT(token, secret);
  
  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  
  return payload.sub;
};

// Generate password reset token
export const generatePasswordResetToken = async (
  userId: string,
  secret: string
): Promise<string> => {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    type: 'password_reset',
    email: '',
    role: '',
    verified: false
  };

  return generateJWT(payload, secret, 60 * 60); // 1 hour
};

// Verify password reset token
export const verifyPasswordResetToken = async (token: string, secret: string): Promise<string> => {
  const payload = await verifyJWT(token, secret);
  
  if (payload.type !== 'password_reset') {
    throw new Error('Invalid password reset token');
  }
  
  return payload.sub;
};

// Generate email verification token
export const generateEmailVerificationToken = async (
  userId: string,
  email: string,
  secret: string
): Promise<string> => {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    type: 'email_verification',
    role: '',
    verified: false
  };

  return generateJWT(payload, secret, 24 * 60 * 60); // 24 hours
};

// Verify email verification token
export const verifyEmailVerificationToken = async (token: string, secret: string): Promise<{ userId: string; email: string }> => {
  const payload = await verifyJWT(token, secret);
  
  if (payload.type !== 'email_verification') {
    throw new Error('Invalid email verification token');
  }
  
  return {
    userId: payload.sub,
    email: payload.email
  };
};