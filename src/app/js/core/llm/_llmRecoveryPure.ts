// @ts-check
// Pure recovery policy for AI runtime failures. Never returns raw provider text.

export type LlmRecoveryKind = 'offline' | 'timeout' | 'rate_limit' | 'provider' | 'unknown';

export type LlmRecoveryVM = Readonly<{
    kind: LlmRecoveryKind;
    title: string;
    message: string;
    retryLabel: string;
    settingsLabel: string;
}>;

function errorText(error: unknown): string {
    if (!error) return '';
    if (typeof error === 'string') return error.toLowerCase();
    if (typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message).toLowerCase();
    return String(error).toLowerCase();
}

function errorStatus(error: unknown): number | null {
    if (!error || typeof error !== 'object') return null;
    const status = Number((error as { status?: unknown; code?: unknown }).status ?? (error as { code?: unknown }).code);
    return Number.isFinite(status) ? status : null;
}

export function classifyLlmRuntimeFailure(error: unknown, online: boolean = true): LlmRecoveryKind {
    const text = errorText(error);
    const status = errorStatus(error);
    const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name) : '';
    if (!online || /failed to fetch|networkerror|network request|offline/.test(text)) return 'offline';
    if (/timeout|timed out/i.test(`${name} ${text}`) || name === 'AbortError') return 'timeout';
    if (status === 429 || /rate.?limit|too many requests/.test(text)) return 'rate_limit';
    if ((status !== null && status >= 500) || /provider|upstream|service unavailable/.test(text)) return 'provider';
    return 'unknown';
}

export function buildLlmRecoveryVM(error: unknown, online: boolean = true): LlmRecoveryVM {
    const kind = classifyLlmRuntimeFailure(error, online);
    const copy: Record<LlmRecoveryKind, Pick<LlmRecoveryVM, 'title' | 'message'>> = {
        offline: {
            title: 'Sem conexão com a internet',
            message: 'Sua mensagem foi mantida. Verifique a conexão e tente novamente.',
        },
        timeout: {
            title: 'A resposta demorou mais que o esperado',
            message: 'Sua mensagem foi mantida. Você pode tentar novamente agora.',
        },
        rate_limit: {
            title: 'O provedor está recebendo muitas solicitações',
            message: 'Sua mensagem foi mantida. Aguarde um momento e tente novamente.',
        },
        provider: {
            title: 'O provedor de IA está temporariamente indisponível',
            message: 'Sua mensagem foi mantida. Tente novamente ou confira a configuração.',
        },
        unknown: {
            title: 'Não foi possível obter uma resposta',
            message: 'Sua mensagem foi mantida. Tente novamente ou confira a configuração.',
        },
    };
    return Object.freeze({
        kind,
        ...copy[kind],
        retryLabel: 'Tentar novamente',
        settingsLabel: 'Configurar IA',
    });
}

export function createSingleFlightGuard() {
    let active = false;
    return Object.freeze({
        start() {
            if (active) return false;
            active = true;
            return true;
        },
        finish() {
            active = false;
        },
        isActive() {
            return active;
        },
    });
}
