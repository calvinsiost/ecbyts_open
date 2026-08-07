export interface EmergencyLoginResult {
    ok: boolean;
    error?: {
        code?: string;
        message?: string;
    };
}

export function tryEmergencyLogin(email: string, password: string): Promise<EmergencyLoginResult>;

export function getSupabaseClient(): unknown;
