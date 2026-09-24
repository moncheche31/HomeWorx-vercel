/**
 * Minimal file-storage contract. The Supabase-backed implementation currently
 * lives in project-workspace; adapters may be introduced later without
 * rewriting call sites. Kept intentionally small — no speculative methods.
 */

export interface FileStorageService {
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
}
