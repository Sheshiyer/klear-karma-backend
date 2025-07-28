// Debug JWT implementation for Cloudflare Workers
// This script tests JWT generation and verification

// Mock the crypto global for Node.js testing
if (typeof crypto === 'undefined') {
  const { webcrypto } = require('crypto');
  global.crypto = webcrypto;
}

// Mock TextEncoder/TextDecoder if not available
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Base64 URL encode
const base64UrlEncode = (data) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

// Base64 URL decode
const base64UrlDecode = (str) => {
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
const stringToArrayBuffer = (str) => {
  return new TextEncoder().encode(str);
};

// Convert ArrayBuffer to string
const arrayBufferToString = (buffer) => {
  return new TextDecoder().decode(buffer);
};

// Import HMAC key
const importHMACKey = async (secret) => {
  return await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
};

// Generate JWT token
const generateJWT = async (payload, secret, expiresIn = 24 * 60 * 60) => {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
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
const verifyJWT = async (token, secret) => {
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
  const payload = JSON.parse(arrayBufferToString(payloadBuffer));

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

async function testJWT() {
  const secret = 'test-secret-key-for-debugging-jwt-implementation';
  const payload = {
    sub: 'test-user-id-12345',
    email: 'test@example.com',
    role: 'user',
    verified: true
  };

  try {
    console.log('Testing JWT implementation...');
    console.log('Secret:', secret);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    console.log('\n1. Generating JWT...');
    const token = await generateJWT(payload, secret);
    console.log('Generated token:', token);
    console.log('Token length:', token.length);
    console.log('Token parts:', token.split('.').length);
    
    console.log('\n2. Verifying JWT...');
    const verified = await verifyJWT(token, secret);
    console.log('Verified payload:', JSON.stringify(verified, null, 2));
    
    console.log('\n3. Testing with wrong secret...');
    try {
      await verifyJWT(token, 'wrong-secret');
      console.log('ERROR: Should have failed with wrong secret!');
    } catch (error) {
      console.log('✓ Correctly rejected wrong secret:', error.message);
    }
    
    console.log('\n4. Testing expired token...');
    const expiredToken = await generateJWT(payload, secret, -1); // Expired 1 second ago
    try {
      await verifyJWT(expiredToken, secret);
      console.log('ERROR: Should have failed with expired token!');
    } catch (error) {
      console.log('✓ Correctly rejected expired token:', error.message);
    }
    
    console.log('\n✅ JWT test successful!');
    return { success: true, token, verified };
  } catch (error) {
    console.error('❌ JWT test failed:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error: error.message };
  }
}

// Test Authorization header parsing
function testAuthHeaderParsing() {
  console.log('\n5. Testing Authorization header parsing...');
  
  const testCases = [
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
    'bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
    'Bearer',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature',
    ''
  ];
  
  testCases.forEach((header, index) => {
    console.log(`Test ${index + 1}: "${header}"`);
    if (header && header.startsWith('Bearer ')) {
      const token = header.substring(7);
      console.log(`  → Extracted token: "${token}"`);
    } else {
      console.log('  → No valid Bearer token found');
    }
  });
}

async function main() {
  const result = await testJWT();
  testAuthHeaderParsing();
  
  if (result.success) {
    console.log('\n🎉 All tests passed! JWT implementation is working correctly.');
    process.exit(0);
  } else {
    console.log('\n💥 Tests failed! Check the implementation.');
    process.exit(1);
  }
}

main();