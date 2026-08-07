// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ATTEST-001 — FONTE ÚNICA DE VERDADE da vigência de treinamento de NR.
 * SPEC: docs/specs/features/SPEC_ATTESTATION_MODEL.md (eixo E5 — TEMPORALIDADE).
 *
 * ─── O bug que este módulo fecha ────────────────────────────────────────────
 * O mesmo fato — _"trabalhador tem treinamento de NR válido"_ — existia em TRÊS
 * lugares que não se falavam:
 *
 *   (1) `public.training_certificates` (SQL) — **sem coluna de expiração**, logo
 *       um certificado de NR-35 emitido pelo LMS era IMORTAL;
 *   (2) `core/health/clinicalReferenceRanges.ts:537-585` — validade modelada como
 *       BIOMARCADOR (`nr06/nr09/nr15/nr33/nr35_*_days_left`);
 *   (3) `core/ohs/workerSchema.ts:39,50,74` — `validTrainings: string[]`, **sem datas**.
 *
 * Três modelos do mesmo fato, um deles imortal. Treinamento de NR tem validade
 * LEGAL (a NR-35 exige reciclagem BIENAL), então o certificado imortal é
 * afirmação falsa sobre a habilitação de um trabalhador para trabalho em altura.
 *
 * ─── O desenho da correção ──────────────────────────────────────────────────
 * A periodicidade vive **aqui e no catálogo `attestation_schemes` (RF-1)** — e em
 * lugar nenhum mais. Os outros dois modelos passam a DERIVAR:
 *   · o biomarcador `nr*_days_left` vira projeção de {@link daysUntilExpiry};
 *   · `validTrainings: string[]` vira projeção de {@link filterValidTrainings}.
 *
 * O espelhamento TS↔SQL é a única duplicação restante (o cliente precisa calcular
 * offline). Ela é **travada por teste**: `tests/nr-training-validity-pure.test.mjs`
 * compara esta tabela com os seeds da migration e falha se divergirem — para que
 * a divergência não possa voltar silenciosamente, que foi exatamente como os três
 * modelos se separaram.
 *
 * Puro — ZERO DOM, ZERO IO, determinístico. Tudo congelado.
 */

/** Periodicidade legal de reciclagem, em meses. */
export interface NrTrainingRule {
    /** Chave no catálogo `attestation_schemes` (RF-1) — o vínculo E3. */
    readonly schemeUri: string;
    readonly label: string;
    /** Meses até a reciclagem obrigatória. */
    readonly validityMonths: number;
    /** Norma que fixa a periodicidade. Nunca vazia — a regra tem de ser contestável. */
    readonly referenceNorm: string;
    /** Biomarcador correspondente em `core/health/clinicalReferenceRanges.ts`. */
    readonly biomarkerType: string;
}

/**
 * Catálogo das NRs com validade. **NR nova = 1 linha aqui + 1 linha no catálogo
 * SQL, zero código.**
 *
 * Nota de honestidade sobre as periodicidades: a NR-35 fixa reciclagem BIENAL
 * explicitamente. Para NR-06/09/15/33 a periodicidade de 12 meses reproduz o que
 * já estava assumido no `refMax` dos biomarcadores
 * (`clinicalReferenceRanges.ts:537-585`) — este módulo NÃO inventou número novo;
 * ele centraliza o que já existia disperso. Onde a norma exigir revisão desses
 * valores, a correção é nesta tabela e propaga sozinha para os três consumidores.
 */
export const NR_TRAINING_RULES: Readonly<Record<string, NrTrainingRule>> = Object.freeze({
    'nr-06': Object.freeze({
        schemeUri: 'urn:ecbyts:scheme:br:mte:nr-06',
        label: 'NR-6 — Treinamento de EPI',
        validityMonths: 12,
        referenceNorm: 'NR-6 (MTE)',
        biomarkerType: 'nr06_epi_training_days_left',
    }),
    'nr-09': Object.freeze({
        schemeUri: 'urn:ecbyts:scheme:br:mte:nr-09',
        label: 'NR-9 — Treinamento PGRT',
        validityMonths: 12,
        referenceNorm: 'NR-9 (MTE)',
        biomarkerType: 'nr09_pgrt_training_days_left',
    }),
    'nr-15': Object.freeze({
        schemeUri: 'urn:ecbyts:scheme:br:mte:nr-15',
        label: 'NR-15 — Insalubridade',
        validityMonths: 12,
        referenceNorm: 'NR-15 (MTE)',
        biomarkerType: 'nr15_unhealthy_training_days_left',
    }),
    'nr-33': Object.freeze({
        schemeUri: 'urn:ecbyts:scheme:br:mte:nr-33',
        label: 'NR-33 — Espaço confinado',
        validityMonths: 12,
        referenceNorm: 'NR-33 (MTE)',
        biomarkerType: 'nr33_confined_space_days_left',
    }),
    'nr-35': Object.freeze({
        schemeUri: 'urn:ecbyts:scheme:br:mte:nr-35',
        label: 'NR-35 — Trabalho em altura',
        // BIENAL. É esta linha que torna falso o certificado imortal do LMS.
        validityMonths: 24,
        referenceNorm: 'NR-35 (Portaria MTE 313/2012, atualizações 2019)',
        biomarkerType: 'nr35_height_work_days_left',
    }),
});

/** Normaliza "NR35", "nr-35", "NR 35" → "nr-35". `null` se não for uma NR conhecida. */
export function normalizeTrainingId(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const match = raw.trim().toLowerCase().match(/^nr[\s-]?0*(\d{1,2})/);
    const digits = match?.[1];
    if (digits === undefined) return null;
    const key = `nr-${digits.padStart(2, '0')}`;
    return NR_TRAINING_RULES[key] !== undefined ? key : null;
}

/**
 * Calcula o fim de vigência de um certificado.
 *
 * @returns ISO-8601, ou `null` quando a NR é desconhecida ou a data de emissão é
 *   inválida. `null` = vigência NÃO DETERMINADA — jamais "vale para sempre".
 *   Confundir os dois é precisamente o bug do certificado imortal.
 */
export function computeExpiry(trainingId: unknown, issuedAt: unknown): string | null {
    const key = normalizeTrainingId(trainingId);
    if (key === null) return null;
    const rule = NR_TRAINING_RULES[key];
    if (rule === undefined) return null;

    const issued = typeof issuedAt === 'string' || issuedAt instanceof Date
        ? new Date(issuedAt as string | Date)
        : null;
    if (issued === null || Number.isNaN(issued.getTime())) return null;

    const expiry = new Date(issued.getTime());
    expiry.setMonth(expiry.getMonth() + rule.validityMonths);
    return expiry.toISOString();
}

/**
 * Dias restantes até o vencimento. **É esta função que o biomarcador
 * `nr*_days_left` deve projetar** — em vez de ser um segundo modelo do mesmo fato.
 *
 * @returns número de dias (negativo se vencido), ou `null` quando indeterminado.
 *   `null` NUNCA deve ser exibido como 0: zero significa "vence hoje", null
 *   significa "não sabemos" — e forjar zero seria dado inventado.
 */
export function daysUntilExpiry(
    trainingId: unknown,
    issuedAt: unknown,
    at: string | Date = new Date(),
): number | null {
    const expiry = computeExpiry(trainingId, issuedAt);
    if (expiry === null) return null;
    const nowMs = at instanceof Date ? at.getTime() : new Date(at).getTime();
    if (!Number.isFinite(nowMs)) return null;
    return Math.floor((new Date(expiry).getTime() - nowMs) / 86_400_000);
}

/** Estado do certificado. Não colapsa em booleano (E6). */
export type TrainingStatus = 'granted' | 'expired' | 'revoked' | 'undetermined';

export interface TrainingCertificateLike {
    readonly trainingId?: unknown;
    readonly training_id?: unknown;
    readonly issuedAt?: unknown;
    readonly issued_at?: unknown;
    readonly expiresAt?: unknown;
    readonly expires_at?: unknown;
    readonly revokedAt?: unknown;
    readonly revoked_at?: unknown;
}

/**
 * Estado derivado de um certificado de treinamento.
 *
 * `undetermined` existe e é DISTINTO de `granted`: era a confusão entre os dois
 * que tornava o certificado imortal. Um certificado sem vigência determinável não
 * habilita ninguém — ele apenas não afirma vencimento.
 */
export function evaluateTrainingCertificate(
    cert: TrainingCertificateLike | null | undefined,
    at: string | Date = new Date(),
): { readonly status: TrainingStatus; readonly expiresAt: string | null; readonly daysLeft: number | null } {
    const c = cert ?? {};

    const revoked = c.revokedAt ?? c.revoked_at;
    if (typeof revoked === 'string' && revoked.trim().length > 0) {
        return Object.freeze({ status: 'revoked' as const, expiresAt: null, daysLeft: null });
    }

    const trainingId = c.trainingId ?? c.training_id;
    const issuedAt = c.issuedAt ?? c.issued_at;

    // Vigência explícita no registro vence a derivada (o servidor pode ter gravado
    // uma data específica); só então caímos na regra do catálogo.
    const explicit = c.expiresAt ?? c.expires_at;
    const expiresAt = typeof explicit === 'string' && explicit.trim().length > 0
        ? explicit
        : computeExpiry(trainingId, issuedAt);

    if (expiresAt === null) {
        return Object.freeze({ status: 'undetermined' as const, expiresAt: null, daysLeft: null });
    }

    const nowMs = at instanceof Date ? at.getTime() : new Date(at).getTime();
    const untilMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(nowMs) || !Number.isFinite(untilMs)) {
        return Object.freeze({ status: 'undetermined' as const, expiresAt, daysLeft: null });
    }

    const daysLeft = Math.floor((untilMs - nowMs) / 86_400_000);
    return Object.freeze({
        status: (untilMs <= nowMs ? 'expired' : 'granted') as TrainingStatus,
        expiresAt,
        daysLeft,
    });
}

/**
 * Projeta certificados para o `validTrainings: string[]` de
 * `core/ohs/workerSchema.ts` — mantendo o shape legado (RF-8: não quebra nada),
 * mas agora **derivado de datas** em vez de ser uma lista de strings sem tempo,
 * que nunca sabia dizer se o treinamento ainda valia.
 *
 * Certificados `undetermined` ficam de FORA: sem vigência determinável não há
 * como afirmar habilitação. Incluí-los reproduziria o certificado imortal.
 */
export function filterValidTrainings(
    certificates: ReadonlyArray<TrainingCertificateLike> | null | undefined,
    at: string | Date = new Date(),
): string[] {
    if (!Array.isArray(certificates)) return [];
    const out: string[] = [];
    for (const cert of certificates) {
        if (evaluateTrainingCertificate(cert, at).status !== 'granted') continue;
        const id = normalizeTrainingId(cert?.trainingId ?? cert?.training_id);
        if (id !== null && !out.includes(id)) out.push(id);
    }
    return out;
}
