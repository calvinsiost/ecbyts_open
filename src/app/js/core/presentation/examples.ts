// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Presentation Examples - native reusable story templates for dogfooding/export.
import { createPresentation, listPresentations, updatePresentation, setActivePresentation, getActivePresentation, } from './manager.js';
import { applyProfile } from './storyProfiles.js';
import { validatePresentation } from './persistence.js';
import { validateLaunchReadiness } from './qualityChecks.js';
import { getSuggestedExportPreset } from './videoRecorder.js';
import { RANDOM_VIDEO_TECHNICAL_FAMILIES } from '../elements/randomHighLodDefaults.js';
export const TECHNICAL_STORY_EXAMPLE_KEY = 'ecbyts_technical_story_example';
const DEFAULT_PROFILE_ID = 'launch_video_technical_environmental';
const DEFAULT_SELECTED_FAMILIES = RANDOM_VIDEO_TECHNICAL_FAMILIES;
const DEFAULT_RANDOM_OPTIONS = Object.freeze({
    campaigns: 20,
    wells: 25,
    plumes: 2,
    buildings: 3,
    density: 1.2,
    siteSize: 'medium',
    contaminationLevel: 'medium',
    includeCosts: true,
    transparentVisuals: true,
    seedDemoData: true,
    includeAerialOverlay: true,
    applyHighLodDefaults: true,
    seed: 'mo4thtpt-s7qkrqry',
});
/**
 * @typedef {{x: number, y: number, z: number}} Vector3Like
 * @typedef {{position: Vector3Like, target: Vector3Like, zoom: number}} CameraState
 * @typedef {{camera?: Partial<Vector3Like> & {zoom?: number}, position?: Partial<Vector3Like>, target?: Partial<Vector3Like>, zoom?: number}} CameraStateInput
 * @typedef {{hero?: CameraStateInput, section?: CameraStateInput, top?: CameraStateInput}} CameraStatesInput
 * @typedef {{selectedFamilies?: Iterable<unknown> | unknown[], randomOptions?: Record<string, any>, cameraStates?: CameraStatesInput, id?: string, title?: string, description?: string}} TechnicalStoryOptions
 * @typedef {{id: string, label: string, duration: number, camera: CameraState, focus: Record<string, any>, story: Record<string, any>, motionPreset?: string, runtimeActions?: Array<Record<string, any>>, captionZone?: string, captionAlign?: string}} StepOptions
 */
/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function _clone(value: any) {
    return JSON.parse(JSON.stringify(value));
}
/**
 * @param {CameraStateInput | null | undefined} input
 * @param {CameraState} fallback
 * @returns {CameraState}
 */
function _normalizeCameraState(input: any, fallback: any) {
    if (input?.position && input?.target) {
        return {
            position: {
                x: Number(input.position.x) || fallback.position.x,
                y: Number(input.position.y) || fallback.position.y,
                z: Number(input.position.z) || fallback.position.z,
            },
            target: {
                x: Number(input.target.x) || fallback.target.x,
                y: Number(input.target.y) || fallback.target.y,
                z: Number(input.target.z) || fallback.target.z,
            },
            zoom: Number(input.zoom) || fallback.zoom,
        };
    }
    if (input?.camera && input?.target) {
        return {
            position: {
                x: Number(input.camera.x) || fallback.position.x,
                y: Number(input.camera.y) || fallback.position.y,
                z: Number(input.camera.z) || fallback.position.z,
            },
            target: {
                x: Number(input.target.x) || fallback.target.x,
                y: Number(input.target.y) || fallback.target.y,
                z: Number(input.target.z) || fallback.target.z,
            },
            zoom: Number(input.camera.zoom) || fallback.zoom,
        };
    }
    return _clone(fallback);
}
/**
 * @param {CameraStatesInput} [cameraStates]
 * @returns {{hero: CameraState, section: CameraState, top: CameraState}}
 */
function _resolveCameraStates(cameraStates: any = {}) {
    const heroFallback = {
        position: { x: 120, y: 90, z: 120 },
        target: { x: 0, y: -18, z: 0 },
        zoom: 1,
    };
    const sectionFallback = {
        position: { x: 0, y: 8, z: 185 },
        target: { x: 0, y: -28, z: 0 },
        zoom: 1,
    };
    const topFallback = {
        position: { x: 0, y: 200, z: 0 },
        target: { x: 0, y: -18, z: 0 },
        zoom: 1,
    };
    return {
        hero: _normalizeCameraState(cameraStates.hero, heroFallback),
        section: _normalizeCameraState(cameraStates.section, sectionFallback),
        top: _normalizeCameraState(cameraStates.top, topFallback),
    };
}
/**
 * @param {StepOptions} options
 */
function _buildStep({ id, label, duration, camera, focus, story, motionPreset, runtimeActions = [], captionZone = "lower-mid", captionAlign = "left" }: any) {
    return {
        id,
        label,
        duration,
        transitionDuration: 1.1,
        transitionEase: 'cubic',
        camera,
        focus,
        story,
        layout: {
            caption_zone: captionZone,
            caption_align: captionAlign,
            desktop_safe: true,
            mobile_safe: true,
            frame_clip_mode: 'auto',
            frame_clip_rect: null,
        },
        audio: {
            type: 'tts',
            text: story.voice_script,
            lang: 'pt-BR',
            rate: 0.96,
            pitch: 1,
            volume: 1,
        },
        export: {
            burn_in_caption: true,
            show_headline: true,
            motion_preset: motionPreset || story.intent || 'focus',
            embedAudio: true,
        },
        runtime: {
            actions: runtimeActions,
        },
    };
}
export function listPresentationExamples() {
    return [
        {
            key: TECHNICAL_STORY_EXAMPLE_KEY,
            title: 'Ecbyts · Technical Story Example',
            profileId: DEFAULT_PROFILE_ID,
            description: 'Random transparente, modelo 3D, analise temporal, validacao e EIS em um fluxo tecnico.',
        },
    ];
}
export function getTechnicalStoryRandomRecipe() {
    return {
        selectedFamilies: [...DEFAULT_SELECTED_FAMILIES],
        options: _clone(DEFAULT_RANDOM_OPTIONS),
    };
}
/**
 * @param {TechnicalStoryOptions} [options]
 * @returns {Record<string, any>}
 */
export function buildTechnicalStoryExample(options: any = {}) {
    const randomRecipe = {
        selectedFamilies: _normalizeFamilies(options.selectedFamilies),
        options: {
            ..._clone(DEFAULT_RANDOM_OPTIONS),
            ...(options.randomOptions && typeof options.randomOptions === 'object' ? options.randomOptions : {}),
        },
    };
    const cameraStates = _resolveCameraStates(options.cameraStates);
    const steps = [
        _buildStep({
            id: 'tech-story-random',
            label: 'Gerar caso técnico',
            duration: 6,
            camera: cameraStates.hero,
            focus: { rect: { x: 0.12, y: 0.12, w: 0.76, h: 0.74 }, gravity: 'center' },
            captionZone: 'top',
            captionAlign: 'center',
            story: {
                intent: 'focus',
                audience: 'technical_environmental',
                headline: 'Gere um caso coerente',
                voice_script: 'Comece gerando um caso técnico coerente, com famílias ambientais, imagem aérea padrão, dados demonstrativos e visual transparente.',
                caption_text: 'Random técnico com imagem aérea, dados demonstrativos e visual transparente.',
                caption_short: 'Random técnico com transparência',
                emphasis_terms: ['random', 'transparente', 'imagem aérea'],
                claim_level: 'verified',
            },
            motionPreset: 'focus',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'actions', waitAfterMs: 180 },
                {
                    type: 'open_random_modal',
                    selectedFamilies: randomRecipe.selectedFamilies,
                    options: randomRecipe.options,
                    waitAfterMs: 320,
                },
            ],
        }),
        _buildStep({
            id: 'tech-story-model',
            label: 'Modelo transparente',
            duration: 6.5,
            camera: cameraStates.hero,
            focus: { rect: { x: 0.22, y: 0.24, w: 0.6, h: 0.48 }, gravity: 'center' },
            story: {
                intent: 'proof',
                audience: 'technical_environmental',
                headline: 'Veja superfície e subsuperfície juntas',
                voice_script: 'O modelo resultante mostra superfície e subsuperfície ao mesmo tempo, deixando poços, plumas, limites e camadas legíveis em um único contexto.',
                caption_text: 'Superfície, subsuperfície, poços e plumas no mesmo contexto operacional.',
                caption_short: 'Modelo 3D transparente',
                emphasis_terms: ['subsuperfície', 'plumas', 'poços'],
                claim_level: 'verified',
            },
            motionPreset: 'proof',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'model', waitAfterMs: 160 },
                { type: 'switch_view', mode: '3d', waitAfterMs: 120 },
                { type: 'apply_geology_preset', preset: 'presentation', waitAfterMs: 150 },
                { type: 'fit_all_elements', waitAfterMs: 260 },
            ],
        }),
        _buildStep({
            id: 'tech-story-section',
            label: 'Leitura técnica',
            duration: 6.5,
            camera: cameraStates.section,
            focus: { rect: { x: 0.18, y: 0.28, w: 0.64, h: 0.42 }, gravity: 'center' },
            story: {
                intent: 'proof',
                audience: 'technical_environmental',
                headline: 'Inspecione a geometria técnica',
                voice_script: 'Na leitura técnica, a transparência ajuda a seguir a geometria das camadas, a posição dos poços e a relação entre pluma, terreno e hidrogeologia.',
                caption_text: 'Camadas, poços, terreno e pluma permanecem legíveis na mesma cena.',
                caption_short: 'Leitura técnica do modelo',
                emphasis_terms: ['camadas', 'hidrogeologia', 'geometria'],
                claim_level: 'careful',
            },
            motionPreset: 'proof',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'model', waitAfterMs: 120 },
                { type: 'switch_view', mode: '2d-depth', waitAfterMs: 180 },
                { type: 'apply_geology_preset', preset: 'presentation', waitAfterMs: 120 },
            ],
        }),
        _buildStep({
            id: 'tech-story-temporal',
            label: 'Analise temporal',
            duration: 7,
            camera: cameraStates.section,
            focus: { rect: { x: 0.1, y: 0.16, w: 0.8, h: 0.62 }, gravity: 'center' },
            story: {
                intent: 'proof',
                audience: 'technical_environmental',
                headline: 'Entenda tendencia e ruptura',
                voice_script: 'Na analise temporal, as observacoes do proprio modelo viram tendencia, ruptura e comportamento de serie sem sair do Ecbyts.',
                caption_text: 'Series do modelo viram tendencia, ruptura e leitura temporal no proprio Ecbyts.',
                caption_short: 'Analise temporal no modelo',
                emphasis_terms: ['temporal', 'tendencia', 'ruptura'],
                claim_level: 'verified',
            },
            motionPreset: 'proof',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'model', waitAfterMs: 120 },
                { type: 'switch_view', mode: '3d', waitAfterMs: 120 },
                {
                    type: 'open_temporal_analysis',
                    preferredFamilies: ['well', 'sensor', 'sample'],
                    preferredParameters: ['benzene', 'water_level', 'conductivity', 'temperature', 'ph'],
                    minObservations: 6,
                    waitAfterMs: 320,
                },
            ],
        }),
        _buildStep({
            id: 'tech-story-validation',
            label: 'Perfis de validação',
            duration: 6.25,
            camera: cameraStates.hero,
            focus: { rect: { x: 0.18, y: 0.16, w: 0.64, h: 0.66 }, gravity: 'center' },
            story: {
                intent: 'proof',
                audience: 'technical_environmental',
                headline: 'Aplique guardrails técnicos',
                voice_script: 'Depois da análise, aplique perfis de validação para transformar consistência, limites e qualidade de observação em guardrails explícitos do fluxo.',
                caption_text: 'Perfis de validação transformam regras técnicas em guardrails operacionais.',
                caption_short: 'Guardrails de validação',
                emphasis_terms: ['validação', 'regras', 'qualidade'],
                claim_level: 'verified',
            },
            motionPreset: 'proof',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'model', waitAfterMs: 140 },
                { type: 'switch_view', mode: '3d', waitAfterMs: 120 },
                { type: 'open_validation_profiles', waitAfterMs: 260 },
            ],
        }),
        _buildStep({
            id: 'tech-story-eis',
            label: 'EIS auditável',
            duration: 6.75,
            camera: cameraStates.hero,
            focus: { rect: { x: 0.16, y: 0.14, w: 0.68, h: 0.7 }, gravity: 'center' },
            story: {
                intent: 'proof',
                audience: 'technical_environmental',
                headline: 'Quantifique prontidão técnica',
                voice_script: 'O EIS fecha a narrativa: você mede transparência, completude, consistência e comparabilidade em um score auditável, conectado ao próprio modelo.',
                caption_text: 'EIS mede prontidão técnica com score auditável ligado ao modelo.',
                caption_short: 'EIS ligado ao modelo',
                emphasis_terms: ['EIS', 'consistência', 'comparabilidade'],
                claim_level: 'verified',
            },
            motionPreset: 'proof',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'model', waitAfterMs: 120 },
                { type: 'switch_view', mode: '3d', waitAfterMs: 120 },
                { type: 'open_eis_dashboard', waitAfterMs: 280 },
            ],
        }),
        _buildStep({
            id: 'tech-story-handoff',
            label: 'Handoff técnico',
            duration: 5.5,
            camera: cameraStates.hero,
            focus: { rect: { x: 0.2, y: 0.24, w: 0.6, h: 0.46 }, gravity: 'center' },
            captionZone: 'middle',
            captionAlign: 'center',
            story: {
                intent: 'cta',
                audience: 'technical_environmental',
                headline: 'Modelo, análise e narrativa no mesmo fluxo',
                voice_script: 'Esse mesmo fluxo vira uma apresentação reutilizável dentro do Ecbyts, pronta para revisão técnica, handoff e comunicação estruturada.',
                caption_text: 'O próprio Ecbyts vira o ambiente de geração, análise e comunicação técnica.',
                caption_short: 'Fluxo técnico reutilizável',
                emphasis_terms: ['apresentação', 'handoff', 'reutilizável'],
                claim_level: 'verified',
            },
            motionPreset: 'cta',
            runtimeActions: [
                { type: 'close_known_surfaces' },
                { type: 'switch_group', group: 'model', waitAfterMs: 120 },
                { type: 'switch_view', mode: '3d', waitAfterMs: 120 },
                { type: 'apply_geology_preset', preset: 'presentation', waitAfterMs: 120 },
                { type: 'fit_all_elements', waitAfterMs: 180 },
            ],
        }),
    ];
    const draft = applyProfile({
        id: options.id || 'ecbyts-technical-story-example',
        version: '1.1',
        title: options.title || 'Ecbyts · Technical Story Example',
        description: options.description ||
            'Exemplo tecnico nativo do Ecbyts: random transparente, modelo 3D, analise temporal, validacao e EIS.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        aspectRatio: '9:16',
        videoPresetId: getSuggestedExportPreset(DEFAULT_PROFILE_ID),
        steps,
        audioTrack: null,
    }, DEFAULT_PROFILE_ID);
    const presentation = (validatePresentation(draft)) as Record<string, any> | null;
    if (!presentation) {
        throw new Error('Failed to build technical story example');
    }
    const readiness = validateLaunchReadiness(presentation, { viewport: 'desktop' });
    return {
        ...presentation,
        videoPresetId: getSuggestedExportPreset(DEFAULT_PROFILE_ID),
        metadata: {
            exampleKey: TECHNICAL_STORY_EXAMPLE_KEY,
            exampleKind: 'technical_story',
            readiness,
            randomRecipe,
        },
    };
}
/**
 * @param {Iterable<unknown> | unknown[] | undefined} selectedFamilies
 * @returns {string[]}
 */
function _normalizeFamilies(selectedFamilies: any) {
    const normalized = _normalizeList(selectedFamilies);
    return normalized.length ? normalized : [...DEFAULT_SELECTED_FAMILIES];
}
/**
 * @param {Iterable<unknown> | unknown[] | undefined} value
 * @returns {string[]}
 */
function _normalizeList(value: any) {
    if (value instanceof Set)
        return [...value].map(String).filter(Boolean);
    if (Array.isArray(value))
        return value.map(String).filter(Boolean);
    return [];
}
/**
 * @param {TechnicalStoryOptions} [options]
 * @returns {Record<string, any> & {id: string}}
 */
export function createOrReplaceTechnicalStoryExample(options = {}) {
    const built = buildTechnicalStoryExample(options);
    const existing = listPresentations().find((presentation: any) => presentation?.exampleKey === TECHNICAL_STORY_EXAMPLE_KEY);
    if (existing) {
        const updated: any = updatePresentation(existing.id, {
            ...built,
            id: existing.id,
            exampleKey: TECHNICAL_STORY_EXAMPLE_KEY,
            exampleKind: 'technical_story',
            exampleReadiness: (built as any).metadata?.readiness || null,
            randomRecipe: (built as any).metadata?.randomRecipe || null,
        });
        if (!updated) {
            throw new Error('Failed to update technical story example');
        }
        setActivePresentation(updated.id);
        return updated;
    }
    const created: any = createPresentation((built as any).title, (built as any).description, {
        profileId: (built as any).profileId || DEFAULT_PROFILE_ID,
        videoPresetId: built.videoPresetId,
    });
    if (!created) {
        throw new Error('Failed to create technical story example');
    }
    const updated: any = updatePresentation(created.id, {
        ...built,
        id: created.id,
        exampleKey: TECHNICAL_STORY_EXAMPLE_KEY,
        exampleKind: 'technical_story',
        exampleReadiness: (built as any).metadata?.readiness || null,
        randomRecipe: (built as any).metadata?.randomRecipe || null,
    });
    if (!updated) {
        throw new Error('Failed to update technical story example');
    }
    setActivePresentation(updated.id);
    return updated;
}
/**
 * @param {TechnicalStoryOptions} [options]
 * @returns {Record<string, any> & {id: string}}
 */
export function ensureTechnicalStoryExamplePresentation(options = {}) {
    const existing = listPresentations().find((presentation: any) => presentation?.exampleKey === TECHNICAL_STORY_EXAMPLE_KEY);
    if (existing) {
        return /** @type {Record<string, any> & {id: string}} */ (existing);
    }
    const activeBefore = getActivePresentation()?.id || null;
    const created = createOrReplaceTechnicalStoryExample(options);
    if (activeBefore && activeBefore !== created.id) {
        setActivePresentation(activeBefore);
    }
    return created;
}
