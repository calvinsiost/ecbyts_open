// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Surya Wizard Step Resolver — pure logic for RF3 of
 * SPEC_INGESTION_SURYA_OCR_INTEGRATION.
 *
 * Decides which step of the ingestion wizard to show given the current
 * state (file uploaded? feature flag on? user accepted opt-in?). Pure:
 * caller passes the state; module returns a frozen step verdict.
 *
 * Steps:
 *   1. `idle`           — no file yet (or wizard just opened)
 *   2. `file_dropped`   — file present, awaiting OCR opt-in decision
 *   3. `surya_opt_in`   — show "Processar via Surya?" prompt (only when
 *                          feature flag ON + file type compatible)
 *   4. `processing`     — OCR running
 *   5. `quality_review` — Surya finished with quality_score in review band
 *   6. `done`           — accepted, ingestion downstream
 *   7. `rejected`       — too low quality OR user declined
 *
 * Tests live in `tests/surya-wizard-step-pure.test.mjs`.
 */

export type WizardStep =
    | 'idle'
    | 'file_dropped'
    | 'surya_opt_in'
    | 'processing'
    | 'quality_review'
    | 'done'
    | 'rejected';

export interface WizardStateInput {
    readonly fileHash?: string | null;
    readonly fileMime?: string | null;
    readonly suryaEnabled: boolean;
    readonly userOptedIn?: 'accepted' | 'declined' | null;
    readonly surveyTaskStatus?: 'queued' | 'processing' | 'done' | 'error' | null;
    readonly qualityScore?: number | null;
}

export interface WizardStepVM {
    readonly step: WizardStep;
    readonly nextActionKey: string;
    readonly canAdvance: boolean;
    readonly showSuryaPrompt: boolean;
    readonly detail: Readonly<Record<string, string>>;
}

const COMPATIBLE_MIMES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/tiff',
    'image/webp',
]);

const REVIEW_BAND_MIN = 0.6;
const REVIEW_BAND_MAX = 0.85;

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function freezeVm(vm: WizardStepVM): WizardStepVM {
    return Object.freeze({
        ...vm,
        detail: Object.freeze({ ...vm.detail }),
    });
}

function isCompatibleMime(mime: string | null | undefined): boolean {
    return typeof mime === 'string' && COMPATIBLE_MIMES.has(mime);
}

/**
 * Resolve the wizard step from current state. Pure: returns frozen VM.
 *
 * Decision tree:
 *   1. No file → idle
 *   2. File present + Surya disabled → file_dropped (skip Surya)
 *   3. File present + Surya enabled + MIME incompatible → file_dropped (skip Surya)
 *   4. File + Surya enabled + MIME compat + no opt-in → surya_opt_in
 *   5. User declined → rejected (silently downgraded to neuro-symbolic path)
 *   6. User accepted + status processing/queued → processing
 *   7. Status done + quality < REVIEW_MIN → rejected
 *   8. Status done + REVIEW_MIN ≤ quality < REVIEW_MAX → quality_review
 *   9. Status done + quality ≥ REVIEW_MAX → done
 */
export function resolveWizardStep(input: WizardStateInput | null | undefined): WizardStepVM {
    if (!input || typeof input !== 'object') {
        return freezeVm({
            step: 'idle',
            nextActionKey: 'wizard.action.dropFile',
            canAdvance: false,
            showSuryaPrompt: false,
            detail: {},
        });
    }
    if (!isNonEmptyString(input.fileHash)) {
        return freezeVm({
            step: 'idle',
            nextActionKey: 'wizard.action.dropFile',
            canAdvance: false,
            showSuryaPrompt: false,
            detail: {},
        });
    }
    const compatible = isCompatibleMime(input.fileMime);
    const flagOn = input.suryaEnabled === true;

    if (!flagOn || !compatible) {
        return freezeVm({
            step: 'file_dropped',
            nextActionKey: 'wizard.action.continueStandardPath',
            canAdvance: true,
            showSuryaPrompt: false,
            detail: {
                reason: !flagOn ? 'surya_disabled' : 'mime_incompatible',
                mime: input.fileMime ?? '',
            },
        });
    }

    if (input.userOptedIn === null || input.userOptedIn === undefined) {
        return freezeVm({
            step: 'surya_opt_in',
            nextActionKey: 'wizard.action.chooseSurya',
            canAdvance: false,
            showSuryaPrompt: true,
            detail: { mime: input.fileMime ?? '' },
        });
    }
    if (input.userOptedIn === 'declined') {
        return freezeVm({
            step: 'rejected',
            nextActionKey: 'wizard.action.continueStandardPath',
            canAdvance: true,
            showSuryaPrompt: false,
            detail: { reason: 'user_declined' },
        });
    }

    // userOptedIn === 'accepted' — check task status
    const status = input.surveyTaskStatus;
    if (status === 'queued' || status === 'processing') {
        return freezeVm({
            step: 'processing',
            nextActionKey: 'wizard.action.wait',
            canAdvance: false,
            showSuryaPrompt: false,
            detail: { status },
        });
    }
    if (status === 'error') {
        return freezeVm({
            step: 'rejected',
            nextActionKey: 'wizard.action.retryOrStandard',
            canAdvance: true,
            showSuryaPrompt: false,
            detail: { reason: 'edge_error' },
        });
    }
    if (status === 'done') {
        const q = typeof input.qualityScore === 'number' ? input.qualityScore : 0;
        if (q < REVIEW_BAND_MIN) {
            return freezeVm({
                step: 'rejected',
                nextActionKey: 'wizard.action.continueStandardPath',
                canAdvance: true,
                showSuryaPrompt: false,
                detail: { reason: 'quality_too_low', quality: String(q) },
            });
        }
        if (q < REVIEW_BAND_MAX) {
            return freezeVm({
                step: 'quality_review',
                nextActionKey: 'wizard.action.reviewQuality',
                canAdvance: true,
                showSuryaPrompt: false,
                detail: { quality: String(q) },
            });
        }
        return freezeVm({
            step: 'done',
            nextActionKey: 'wizard.action.finish',
            canAdvance: true,
            showSuryaPrompt: false,
            detail: { quality: String(q) },
        });
    }

    // Accepted but no status yet → processing
    return freezeVm({
        step: 'processing',
        nextActionKey: 'wizard.action.wait',
        canAdvance: false,
        showSuryaPrompt: false,
        detail: { status: 'pending' },
    });
}

/**
 * Convenience — list all reachable steps. Useful for tests + breadcrumb UI.
 */
export function getAllWizardSteps(): ReadonlyArray<WizardStep> {
    return Object.freeze([
        'idle',
        'file_dropped',
        'surya_opt_in',
        'processing',
        'quality_review',
        'done',
        'rejected',
    ]);
}

export const SURYA_WIZARD_REVIEW_BAND_MIN = REVIEW_BAND_MIN;
export const SURYA_WIZARD_REVIEW_BAND_MAX = REVIEW_BAND_MAX;
