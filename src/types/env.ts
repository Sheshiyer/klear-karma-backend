// Environment variables and bindings for Cloudflare Workers
/// <reference path="../../worker-configuration.d.ts" />

export interface WorkerEnv extends Env {
  // Additional KV Namespaces not in wrangler.toml
  ADMINS_KV: KVNamespace;
  BOOKINGS_KV: KVNamespace;
  PRODUCTS_KV: KVNamespace;
  AUDIT_LOGS_KV: KVNamespace;
  SEARCH_INDEX_KV: KVNamespace;
  
  // Additional environment variables
  ADMIN_KEY: string;
  ENCRYPTION_KEY: string;
  
  // Optional bindings
  DB?: D1Database;
  BUCKET?: R2Bucket;
  QUEUE?: Queue;
}

// Context type for request handling
export interface RequestContext {
  waitUntil: (promise: Promise<any>) => void;
  passThroughOnException: () => void;
}