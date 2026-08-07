// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface TrainingReturnContext {
    readonly hasContext: boolean;
    readonly label: string;
    readonly hint: string;
    readonly returnLabel: string;
    readonly course: string;
    readonly slide: number | null;
    readonly presetId: string;
    readonly source: string;
    readonly purpose: string;
    readonly rawInput: unknown;
}

export interface TrainingReturnContextDefaults {
    readonly label?: string;
    readonly returnLabel?: string;
    readonly source?: string;
    readonly purpose?: string;
}

export interface RenderTrainingReturnBannerOptions {
    readonly host: Element | null | undefined;
    readonly context: TrainingReturnContext;
    readonly source?: string;
    readonly className?: string;
}

const STYLE_MARKER = 'data-training-return-context-styles';

function text(value: unknown, fallback = ''): string {
    return String(value ?? fallback).trim();
}

function numberOrNull(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function readObjectValue(input: Record<string, unknown>, keys: readonly string[], fallback = ''): string {
    for (const key of keys) {
        const value = text(input[key]);
        if (value) return value;
    }
    return fallback;
}

function buildHint(input: {
    readonly course: string;
    readonly slide: number | null;
    readonly presetId: string;
    readonly purpose: string;
}): string {
    const parts: string[] = [];
    if (input.course) parts.push(`curso ${input.course}`);
    if (input.slide) parts.push(`slide ${input.slide}`);
    if (input.presetId) parts.push(`preset ${input.presetId}`);
    if (input.purpose) parts.push(`uso ${input.purpose}`);
    return parts.length ? `Aberto a partir da aula: ${parts.join(' · ')}.` : '';
}

export function normalizeTrainingReturnContext(
    input: unknown,
    defaults: TrainingReturnContextDefaults = {},
): TrainingReturnContext {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return Object.freeze({
            hasContext: false,
            label: '',
            hint: '',
            returnLabel: text(defaults.returnLabel, 'Voltar'),
            course: '',
            slide: null,
            presetId: '',
            source: '',
            purpose: '',
            rawInput: input,
        });
    }

    const obj = input as Record<string, unknown>;
    const source = readObjectValue(obj, ['source', 'origin'], text(defaults.source));
    const course = readObjectValue(obj, ['course', 'courseId', 'trainingId']);
    const slide = numberOrNull(obj.slide ?? obj.slideNumber ?? obj.lessonNumber);
    const presetId = readObjectValue(obj, ['presetId', 'modelPresetId', 'preset', 'target', 'id']);
    const purpose = readObjectValue(obj, ['purpose', 'mode'], text(defaults.purpose));
    const explicitHint = readObjectValue(obj, ['hint', 'contextHint']);
    const hasContext = Boolean(course || slide || presetId || source === 'training' || purpose);
    const label = readObjectValue(obj, ['label', 'contextLabel'], hasContext ? text(defaults.label, 'Aula ecbyts') : '');
    const returnLabel = readObjectValue(obj, ['returnLabel'], hasContext ? text(defaults.returnLabel, 'Voltar ao slide') : 'Voltar');
    const hint = explicitHint || (hasContext ? buildHint({ course, slide, presetId, purpose }) : '');

    return Object.freeze({
        hasContext,
        label,
        hint,
        returnLabel,
        course,
        slide,
        presetId,
        source,
        purpose,
        rawInput: input,
    });
}

function injectTrainingReturnStyles(documentRef: Document): void {
    if (documentRef.querySelector(`style[${STYLE_MARKER}="true"]`)) return;
    const style = documentRef.createElement('style');
    style.setAttribute(STYLE_MARKER, 'true');
    style.textContent = `
.training-return-context-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 10px 12px;
    padding: 10px 12px;
    border: 1px solid rgba(74, 144, 217, 0.45);
    border-radius: 8px;
    background: rgba(28, 55, 91, 0.58);
    color: var(--text-primary, #f3f7ff);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
}
.training-return-context-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
}
.training-return-context-copy strong {
    font-size: 13px;
    line-height: 1.25;
}
.training-return-context-copy span {
    color: var(--text-secondary, rgba(255,255,255,.68));
    font-size: 12px;
    line-height: 1.35;
}
.training-return-context-button {
    min-height: 34px;
    padding: 7px 10px;
    border: 1px solid rgba(90, 160, 230, 0.72);
    border-radius: 6px;
    background: rgba(37, 99, 155, 0.9);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
}
.training-return-context-button:hover,
.training-return-context-button:focus-visible {
    background: rgba(47, 117, 184, 0.96);
    outline: none;
}
@media (max-width: 640px) {
    .training-return-context-banner {
        align-items: stretch;
        flex-direction: column;
    }
    .training-return-context-button {
        width: 100%;
    }
}`;
    documentRef.head.appendChild(style);
}

export async function returnToTrainingSlide(context: TrainingReturnContext, source = 'module'): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent('training:request-return-to-slide', { detail: context }));
    } catch (e: any) {
        console.debug('[training-return] return event skipped', e?.message || e);
    }
    // PIPELINE-PACK-CUSTOMIZATION-WORKBENCH#1: o contexto do módulo carrega o
    // slug LÓGICO do curso (ex.: 'intro-module01'); o id REAL do rascunho que
    // lançou o módulo fica registrado pelo authoring em
    // window.__ecbytsTrainingDeckReturn antes do overlay fechar. Tenta o id
    // real primeiro; o slug do contexto fica como fallback. Sucesso = overlay
    // do authoring de fato montado (openCourseAuthoringModal retorna void e
    // apenas mostra toast quando o curso não existe).
    const marker = (window as any).__ecbytsTrainingDeckReturn as
        | { courseId?: string; slide?: number | null }
        | undefined;
    const initialSlide = context.slide ?? numberOrNull(marker?.slide);
    const candidateIds = [text(marker?.courseId), context.course].filter(Boolean);
    for (const courseId of candidateIds) {
        try {
            const mod: any = await import('./lmsAuthoringModal.js' as string);
            if (typeof mod.openCourseAuthoringModal !== 'function') break;
            await mod.openCourseAuthoringModal(courseId, {
                initialFocus: 'deck',
                ...(initialSlide ? { initialSlide } : {}),
            });
            if (document.getElementById('lms-authoring-overlay')) return;
        } catch (e: any) {
            console.debug('[training-return] direct slide return failed', e?.message || e);
        }
    }
    const w = window as any;
    const openTraining = w.openLmsModule || w.handleOpenTraining;
    if (typeof openTraining === 'function') {
        void openTraining({
            activeTab: 'createdCourses',
            skipResume: true,
            returnTo: {
                source,
                course: context.course,
                slide: context.slide,
                presetId: context.presetId,
            },
        });
    }
}

export function clearTrainingReturnBanner(host: Element | null | undefined): void {
    if (!host) return;
    host.querySelectorAll('.training-return-context-banner').forEach((banner) => banner.remove());
}

export function renderTrainingReturnBanner(options: RenderTrainingReturnBannerOptions): HTMLElement | null {
    const { host, context, source = 'module', className = '' } = options;
    if (!host || !context.hasContext) {
        clearTrainingReturnBanner(host);
        return null;
    }
    const documentRef = host.ownerDocument;
    injectTrainingReturnStyles(documentRef);
    clearTrainingReturnBanner(host);

    const banner = documentRef.createElement('section');
    banner.className = `training-return-context-banner${className ? ` ${className}` : ''}`;
    banner.setAttribute('data-training-return-context', source);
    banner.setAttribute('aria-label', 'Contexto da aula');

    const copy = documentRef.createElement('div');
    copy.className = 'training-return-context-copy';
    const title = documentRef.createElement('strong');
    title.textContent = context.label || 'Aula ecbyts';
    const hint = documentRef.createElement('span');
    hint.textContent = context.hint || 'Aberto a partir do Workbench da aula.';
    copy.append(title, hint);

    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'training-return-context-button';
    button.textContent = context.returnLabel || 'Voltar ao slide';
    button.addEventListener('click', () => void returnToTrainingSlide(context, source));

    banner.append(copy, button);
    host.prepend(banner);
    return banner;
}
