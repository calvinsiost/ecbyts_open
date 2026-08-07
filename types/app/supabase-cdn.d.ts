// Ambient declaration for Supabase CDN module (used by utils/auth/session.js).
// Permissive `any` types — runtime is CDN-loaded, TS just needs the import to resolve.

declare module 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.100.0/+esm' {
    export const createClient: any;
    const _default: any;
    export default _default;
}
