export const SUPABASE_URL: string;
export const SUPABASE_KEY: string;
export const SUPABASE_PUBLISHABLE_KEY: string;
/** Emergency-login bypass allowlist (from TRUSTED_BYPASS_EMAILS env). Empty in public builds. */
export const TRUSTED_BYPASS_EMAILS: readonly string[];
/** MASTER gate email (from MASTER_EMAIL env). Empty in public builds → gate fail-closed. */
export const MASTER_EMAIL: string;
