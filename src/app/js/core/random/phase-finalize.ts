// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/**
 * Phase Finalize - RANDOM-REBUILD-V2 Phase C.2 (2026-04-11).
 *
 * Extracted from app/js/core/elements/randomModel.js:
 *   - _rmSeedVisualization (was phase 7 orchestration)
 *   - _seedServiceRequests (helper called by phase 7)
 *   - _seedSymbologyProfiles (helper called by phase 7)
 *
 * All three functions are pure relative to random orchestration state
 * (they do not read ctx for _seedServiceRequests/_seedSymbologyProfiles;
 * _rmSeedVisualization receives ctx but only forwards via side effects).
 *
 * Consumers from the orchestration layer get the public names without
 * the `_rm*` prefix: `seedVisualization`, `seedServiceRequests`,
 * `seedSymbologyProfiles`. randomModel.js re-imports under the private
 * alias to preserve existing internal call sites.
 */
import { createIssue, SERVICE_TYPES } from '../issues/manager.js';
import { resetProfiles, createProfile, saveProfiles, applyProfile } from '../symbology/manager.js';
import { applyPreset } from '../../utils/vizSettings/manager.js';
import { runtimeRandom } from './runtime.js';
/**
 * Phase 7: Seed symbology profiles, service requests, credential level.
 * @param {{ opts?: { transparentVisuals?: boolean } } | null | undefined} ctx - shared context
 */
export function seedVisualization(ctx: any) {
    const useTransparentVisuals = ctx?.opts?.transparentVisuals !== false;
    // SERVICE REQUESTS - 2-3 solicitações planejadas
    seedServiceRequests();
    // SYMBOLOGY PROFILES - 10 perfis padrão
    const seeded = seedSymbologyProfiles();
    try {
        applyPreset(useTransparentVisuals ? 'presentation' : 'default');
        if (useTransparentVisuals && seeded?.presentationProfileId) {
            applyProfile(seeded.presentationProfileId);
        }
    }
    catch (err: any) {
        console.warn('[random] visual hero preset skipped:', err?.message || err);
    }
    // RADAR PROFILES Phase 8 (SPEC_DATASTUDIO_RADAR_PROFILES §2.3) — gap E.
    // Fire-and-forget: seed 9 stakeholder profiles SE o modelo está
    // cloud-synced (projectId real em public.models). Skip silencioso
    // quando offline/local-only — não bloqueia random gen.
    try {
        const projectId = ctx?.projectId || (typeof window !== 'undefined' && window.__currentProjectId) || null;
        if (projectId) {
            const locale = (typeof window !== 'undefined' && window.__ecbtLocale) || 'pt-BR';
            import('./generators/seedRadarProfiles.js')
                .then((m: any) => m.seedRadarProfilesForProject?.(projectId, locale))
                .then((r: any) => {
                if (r)
                    console.debug('[random:phase8] radar profiles seeded', r?.inserted ?? r);
            })
                .catch((e: any) => console.debug('[random:phase8] radar seed skipped:', e?.message || e));
        }
    }
    catch (err: any) {
        console.debug('[random:phase8] radar seed guard:', err?.message || err);
    }
    // RADAR COMMUNICATE PREVIEWS (RND-RADAR-COMM-001) — local, offline-first.
    // Sempre semeia previews de broadcast LOCAIS (sem gate de cloud) para que a aba
    // "My Broadcasts" do Radar não fique vazia num modelo recém-gerado.
    try {
        import('./generators/seedRadarBroadcasts.js')
            .then((m: any) => m.seedRadarBroadcastPreviews?.({}))
            .then((n: any) => console.debug('[random:phase8] radar previews seeded', Array.isArray(n) ? n.length : n))
            .catch((e: any) => console.debug('[random:phase8] radar preview skipped:', e?.message || e));
    }
    catch (err: any) {
        console.debug('[random:phase8] radar preview guard:', err?.message || err);
    }
}
// ================================================================
// SERVICE REQUESTS - Solicitações de serviços ambientais planejados
/**
 * Cria 2-3 service requests de demonstração após geração do modelo aleatório.
 */
export function seedServiceRequests() {
    const srTypes = Object.keys(SERVICE_TYPES);
    const count = 2 + Math.floor(runtimeRandom('visual') * 2); // 2 ou 3
    const spread = 50;
    for (let i = 0; i < count; i++) {
        const sType = srTypes[i % srTypes.length];
        createIssue({
            type: 'service_request',
            status: 'planned',
            title: `[Planejado] ${(SERVICE_TYPES as any)[sType as any]}`,
            serviceType: sType,
            severity: 'medium',
            description: 'Gerado automaticamente pelo modelo aleatório de demonstração.',
            position: {
                x: (runtimeRandom('visual') - 0.5) * spread * 2,
                y: 0,
                z: (runtimeRandom('visual') - 0.5) * spread * 2,
            },
            createdBy: 'demo',
        });
    }
}
// SYMBOLOGY PROFILES - Perfis padrão para modelos aleatórios
// 10 perfis com temas ambientais realistas (CONAMA 420, CETESB)
// ================================================================
/**
 * Limpa perfis existentes e semeadura 10 perfis padrão ambientais.
 * Chamado ao final de generateRandomModel().
 */
export function seedSymbologyProfiles() {
    // Limpa perfis do modelo anterior
    resetProfiles();
    let presentationProfileId: string | null;
    // ── 1. Alerta Benzeno ────────────────────────────────────────────────────
    // Destaca poços com benzeno acima do VI (5 µg/L - CONAMA 420) em vermelho.
    // Poços entre VRQ (0.1) e VI ficam laranja. Resto: cinza.
    {
        const p: any = createProfile('Alerta Benzeno');
        p.rules = [
            {
                id: 'bem-vi',
                name: 'Benzeno > VI (5 µg/L)',
                match: { family: 'well', parameter: 'benzene', operator: '>', value: 5 },
                style: { color: '#e53935', opacity: 1, scaleMultiplier: 1.4 },
            },
            {
                id: 'bem-alert',
                name: 'Benzeno > VRQ (0.1 µg/L)',
                match: { family: 'well', parameter: 'benzene', operator: '>', value: 0.1 },
                style: { color: '#ff9800', opacity: 1, scaleMultiplier: 1.2 },
            },
        ];
        p.elements.byFamily.plume = { color: '#b71c1c', opacity: 0.35 };
        p.scene = {};
    }
    // ── 2. Diagnóstico de Plumas ─────────────────────────────────────────────
    // Plumas em cores diferenciadas por família, poços em branco, alta visibilidade.
    {
        const p: any = createProfile('Diagnóstico de Plumas');
        p.elements.byFamily.plume = { color: '#0288d1', opacity: 0.65, wireframe: false };
        p.elements.byFamily.well = { color: '#ffffff', opacity: 1, scaleMultiplier: 1.2 };
        p.elements.byFamily.tank = { color: '#e65100', opacity: 0.9 };
        p.elements.byFamily.waste = { color: '#6a1b9a', opacity: 0.8 };
        p.scene = { ambientIntensity: 0.8, directionalIntensity: 1.2 };
    }
    // ── 3. Conformidade CONAMA 420 ───────────────────────────────────────────
    // Verde = abaixo do VP; amarelo = entre VP e VI; vermelho = acima do VI.
    // Usa TCE como parâmetro indicador (VI = 70 µg/L CONAMA 420 Uso Industrial).
    {
        const p: any = createProfile('Conformidade CONAMA 420');
        p.rules = [
            {
                id: 'tce-vi',
                name: 'TCE > VI Industrial (70 µg/L)',
                match: { family: 'well', parameter: 'tce', operator: '>', value: 70 },
                style: { color: '#d32f2f', scaleMultiplier: 1.3 },
            },
            {
                id: 'tce-vp',
                name: 'TCE > VP (3 µg/L)',
                match: { family: 'well', parameter: 'tce', operator: '>', value: 3 },
                style: { color: '#f9a825', scaleMultiplier: 1.1 },
            },
        ];
        p.elements.byFamily.well = { color: '#2e7d32', opacity: 1 };
        p.elements.byFamily.plume = { color: '#b71c1c', opacity: 0.5 };
    }
    // ── 4. Vista de Apresentação ─────────────────────────────────────────────
    // Paleta limpa para relatórios executivos: azul/teal, sem wireframe, fundo escuro.
    {
        const p: any = createProfile('Vista de Apresentação');
        presentationProfileId = p.id;
        p.elements.byFamily.plume = { color: '#0097a7', opacity: 0.55 };
        p.elements.byFamily.well = { color: '#e0f7fa', opacity: 1, scaleMultiplier: 1.1 };
        p.elements.byFamily.building = { color: '#546e7a', opacity: 0.85 };
        p.elements.byFamily.boundary = { color: '#b0bec5', opacity: 0.5 };
        p.elements.byFamily.tank = { color: '#78909c', opacity: 0.9 };
        p.elements.byFamily.lake = { color: '#0277bd', opacity: 0.7 };
        p.elements.byFamily.river = { color: '#01579b', opacity: 0.8 };
        p.scene = {
            wireframe: false,
            shadows: true,
            ambientIntensity: 0.68,
            directionalIntensity: 1.18,
            overlayOpacity: 0.42,
            verticalExaggeration: 1.9,
        };
    }
    // ── 5. Inspeção de Infraestrutura ────────────────────────────────────────
    // Destaca tanques e edificações; plumas invisíveis para foco nas estruturas.
    {
        const p: any = createProfile('Inspeção de Infraestrutura');
        p.elements.byFamily.plume = { visible: false };
        p.elements.byFamily.building = { color: '#ff6f00', opacity: 1, scaleMultiplier: 1.2 };
        p.elements.byFamily.tank = { color: '#e53935', opacity: 1, scaleMultiplier: 1.3, wireframe: false };
        p.elements.byFamily.waste = { color: '#7b1fa2', opacity: 0.9 };
        p.elements.byFamily.well = { color: '#90a4ae', opacity: 0.6 };
        p.scene = { shadows: true };
    }
    // ── 6. Monitoramento de Metais ───────────────────────────────────────────
    // Arsênio > 0.01 mg/L (VI CONAMA) em vermelho; chumbo > 0.01 em laranja.
    {
        const p: any = createProfile('Monitoramento de Metais');
        p.rules = [
            {
                id: 'as-vi',
                name: 'Arsênio > VI (0.01 mg/L)',
                match: { family: 'well', parameter: 'arsenic', operator: '>', value: 0.01 },
                style: { color: '#c62828', scaleMultiplier: 1.4 },
            },
            {
                id: 'pb-vi',
                name: 'Chumbo > VI (0.01 mg/L)',
                match: { family: 'well', parameter: 'lead', operator: '>', value: 0.01 },
                style: { color: '#e65100', scaleMultiplier: 1.2 },
            },
        ];
        p.elements.byFamily.well = { color: '#4caf50', opacity: 1 };
        p.elements.byFamily.plume = { color: '#880e4f', opacity: 0.45 };
        p.scene = {};
    }
    // ── 7. Modo Wireframe Técnico ────────────────────────────────────────────
    // Todos os elementos em wireframe com cores de contraste para análise geométrica.
    {
        const p: any = createProfile('Wireframe Técnico');
        p.elements.byFamily.plume = { color: '#00e5ff', opacity: 0.9, wireframe: true };
        p.elements.byFamily.well = { color: '#ffea00', opacity: 1, wireframe: true };
        p.elements.byFamily.building = { color: '#ff6d00', opacity: 0.8, wireframe: true };
        p.elements.byFamily.tank = { color: '#f50057', opacity: 0.8, wireframe: true };
        p.elements.byFamily.boundary = { color: '#76ff03', opacity: 0.7, wireframe: true };
        p.elements.byFamily.lake = { color: '#40c4ff', opacity: 0.7, wireframe: true };
        p.elements.byFamily.river = { color: '#18ffff', opacity: 0.7, wireframe: true };
        p.scene = { wireframe: false };
    }
    // ── 8. Pluma Expandida (Scale-up) ────────────────────────────────────────
    // Aumenta escala de plumas para análise de extensão; poços miniaturizados.
    {
        const p: any = createProfile('Pluma Expandida');
        p.elements.byFamily.plume = { color: '#b71c1c', opacity: 0.5, scaleMultiplier: 2.0 };
        p.elements.byFamily.well = { color: '#ffffff', opacity: 0.7, scaleMultiplier: 0.6 };
        p.scene = {
            verticalExaggeration: 2,
            ambientIntensity: 0.5,
        };
    }
    // ── 9. Hidroquímica - pH e Condutividade ─────────────────────────────────
    // pH < 6 (ácido) → laranja-vermelho; pH > 8 (alcalino) → azul; neutro → verde.
    {
        const p: any = createProfile('Hidroquímica — pH');
        p.rules = [
            {
                id: 'ph-acid',
                name: 'pH < 6 (ácido)',
                match: { family: 'well', parameter: 'pH', operator: '<', value: 6 },
                style: { color: '#e53935', scaleMultiplier: 1.2 },
            },
            {
                id: 'ph-alk',
                name: 'pH > 8 (alcalino)',
                match: { family: 'well', parameter: 'pH', operator: '>', value: 8 },
                style: { color: '#1565c0', scaleMultiplier: 1.2 },
            },
        ];
        p.elements.byFamily.well = { color: '#43a047', opacity: 1 };
        p.elements.byFamily.plume = { color: '#0288d1', opacity: 0.4 };
        p.scene = {};
    }
    // ── 10. Vista Noturna / Campo ────────────────────────────────────────────
    // Fundo escuro profundo; poços em ciano brilhante; plumas em violeta.
    // Ideal para apresentações ou trabalho noturno em campo.
    {
        const p: any = createProfile('Vista Noturna');
        p.elements.byFamily.plume = { color: '#7b1fa2', opacity: 0.6 };
        p.elements.byFamily.well = { color: '#00e5ff', opacity: 1, scaleMultiplier: 1.1 };
        p.elements.byFamily.building = { color: '#ffd54f', opacity: 0.85 };
        p.elements.byFamily.tank = { color: '#ff5722', opacity: 0.9 };
        p.elements.byFamily.spring = { color: '#80deea', opacity: 0.9 };
        p.elements.byFamily.lake = { color: '#1565c0', opacity: 0.7 };
        p.elements.byFamily.river = { color: '#0288d1', opacity: 0.8 };
        p.elements.byFamily.boundary = { color: '#546e7a', opacity: 0.4 };
        p.scene = {
            ambientIntensity: 0.3,
            directionalIntensity: 1.5,
        };
    }
    // Persiste todas as modificações feitas nas referências dos perfis
    saveProfiles();
    return { presentationProfileId };
}
//# sourceMappingURL=phase-finalize.js.map