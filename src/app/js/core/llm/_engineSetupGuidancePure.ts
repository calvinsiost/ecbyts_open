// @ts-check
// Pure first-use copy for the AI engine setup flow.

export type EngineSetupGuidance = {
    reason: 'provider_missing' | 'local_model_missing' | 'webgpu_unavailable';
    title: string;
    message: string;
    actionLabel: string;
};

export function buildEngineSetupGuidance(engine: string): EngineSetupGuidance {
    if (engine === 'local') {
        return Object.freeze({
            reason: 'local_model_missing',
            title: 'Conecte um modelo local',
            message: 'O Ecby precisa de um modelo local selecionado antes de responder. Sua mensagem foi mantida.',
            actionLabel: 'Configurar IA',
        });
    }
    if (engine === 'web-llm') {
        return Object.freeze({
            reason: 'webgpu_unavailable',
            title: 'Escolha outra forma de usar a IA',
            message: 'Este navegador não oferece o recurso necessário para este modo. Sua mensagem foi mantida.',
            actionLabel: 'Escolher provedor',
        });
    }
    return Object.freeze({
        reason: 'provider_missing',
        title: 'Conecte um provedor de IA',
        message: 'O Ecby ainda não pode responder porque nenhum provedor de IA foi configurado. Sua mensagem foi mantida.',
        actionLabel: 'Configurar IA',
    });
}
