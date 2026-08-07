// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   EVIDENCE GATE — integridade do dataset do friendliness score
   FRIEND-SCORE-001 (Calvin 2026-06-14 "avaliar se o script necessita
   melhorias", após o loop de maximização real).

   DOIS achados da avaliação do próprio instrumento:

   1. ANTI-TEATRO. computeFriendlinessScore dá crédito total (penalidade 0)
      a QUALQUER finding com resolved=true, sem exigir prova. Calvin: "fix
      real > progress-theater". Um LLM/humano pode marcar resolved sem
      consertar nada. Este gate operacionaliza a regra NO PRÓPRIO termômetro:
      todo finding resolvido DEVE declarar evidência (commit hash, test id,
      screenshot path). Ratchet impede NOVOS resolved sem prova; legados
      declarados (evidence "legacy:...") são tolerados mas contados à parte.

   2. DESCARTE SILENCIOSO. O coletor _autoSignalToFindingPure emite findings
      nas dimensões `accessibility`/`agent_experience` que o core ainda NÃO
      conhece — computeFriendlinessScore os ignora via includes() guard, sem
      avisar. O axe-core foi ligado no runner mas seus achados caem no chão.
      findUnknownDimension torna esse descarte VISÍVEL até as dimensões serem
      adicionadas ao core (coordenação com claude - novaspec, dona do core).

   Pure: sem DOM, sem rede, sem fs. ADITIVO — NÃO toca _friendlinessScorePure
   (evita colisão de merge com a sessão que edita o core).
   ================================================================ */

/** Prefixo que marca evidência reconhecidamente sem rastreio formal. */
export const EVIDENCE_LEGACY_PREFIX = 'legacy:';

export type EvidenceClass = 'traceable' | 'legacy' | 'missing';

export interface ResolvedFindingLike {
    readonly id?: unknown;
    readonly resolved?: unknown;
    readonly evidence?: unknown;
    readonly dimension?: unknown;
}

/**
 * Classifica a prova de um finding:
 *  - 'traceable' — evidência não-vazia que NÃO começa com "legacy:"
 *    (commit hash, test:..., screenshot:...). Ideal.
 *  - 'legacy'    — declarada como "legacy:..." (resolvido antes deste gate;
 *    sem rastreio formal mas reconhecido). Tolerado.
 *  - 'missing'   — sem evidência. Débito anti-teatro.
 */
export function classifyEvidence(f: ResolvedFindingLike): EvidenceClass {
    const e = typeof f?.evidence === 'string' ? f.evidence.trim() : '';
    if (!e) return 'missing';
    if (e.toLowerCase().startsWith(EVIDENCE_LEGACY_PREFIX)) return 'legacy';
    return 'traceable';
}

export interface EvidencePartition {
    readonly resolved: number;
    readonly traceable: ReadonlyArray<string>;
    readonly legacy: ReadonlyArray<string>;
    readonly missing: ReadonlyArray<string>;
    /** % de resolvidos com prova rastreável (não-legacy). */
    readonly traceablePct: number;
}

/**
 * Particiona os findings RESOLVIDOS por classe de evidência. Determinístico
 * (listas ordenadas). Findings abertos não entram (só resolved precisa provar).
 */
export function partitionResolvedEvidence(
    findings: ReadonlyArray<ResolvedFindingLike>,
): EvidencePartition {
    const list = Array.isArray(findings) ? findings : [];
    const traceable: string[] = [];
    const legacy: string[] = [];
    const missing: string[] = [];
    for (const f of list) {
        if (!f || !f.resolved) continue;
        const id = String(f.id ?? '');
        const c = classifyEvidence(f);
        if (c === 'traceable') traceable.push(id);
        else if (c === 'legacy') legacy.push(id);
        else missing.push(id);
    }
    traceable.sort();
    legacy.sort();
    missing.sort();
    const resolved = traceable.length + legacy.length + missing.length;
    return Object.freeze({
        resolved,
        traceable: Object.freeze(traceable),
        legacy: Object.freeze(legacy),
        missing: Object.freeze(missing),
        traceablePct: resolved > 0 ? Math.round((traceable.length / resolved) * 1000) / 10 : 0,
    });
}

export interface EvidenceGateVerdict {
    readonly ok: boolean;
    readonly missingCount: number;
    readonly baseline: number;
    readonly reason: string;
}

/**
 * Ratchet anti-teatro: falha quando o nº de resolvidos SEM prova AUMENTA vs
 * o baseline. Não quebra retroativamente (baseline absorve o legado), mas
 * impede que um novo "resolved" entre sem commit/test/screenshot.
 */
export function decideEvidenceGate(
    missingCount: number,
    baselineMissing: number = 0,
): EvidenceGateVerdict {
    const miss = Number.isFinite(missingCount) && missingCount >= 0 ? Math.floor(missingCount) : 0;
    const base = Number.isFinite(baselineMissing) && baselineMissing >= 0 ? Math.floor(baselineMissing) : 0;
    if (miss > base) {
        return Object.freeze({
            ok: false,
            missingCount: miss,
            baseline: base,
            reason: `${miss} resolvido(s) sem evidência (baseline ${base}) — todo resolved precisa declarar commit/test/screenshot ("fix real > progress-theater")`,
        });
    }
    return Object.freeze({
        ok: true,
        missingCount: miss,
        baseline: base,
        reason:
            miss === 0
                ? 'todos os resolvidos têm evidência'
                : `${miss} sem prova ≤ baseline ${base} (não regrediu)`,
    });
}

export interface UnknownDimensionFinding {
    readonly id: string;
    readonly dimension: string;
}

/**
 * Findings cuja `dimension` NÃO está no conjunto conhecido pelo core. Esses
 * são DESCARTADOS por computeFriendlinessScore sem aviso (includes() guard).
 * Torna o descarte visível — útil para o coletor auto (axe-core emite
 * `accessibility`/`agent_experience` que o core ainda não aceita).
 */
export function findUnknownDimension(
    findings: ReadonlyArray<ResolvedFindingLike>,
    knownDimensions: ReadonlyArray<string>,
): ReadonlyArray<UnknownDimensionFinding> {
    const known = new Set((Array.isArray(knownDimensions) ? knownDimensions : []).map(String));
    const out: UnknownDimensionFinding[] = [];
    for (const f of Array.isArray(findings) ? findings : []) {
        if (!f) continue;
        const dim = typeof f.dimension === 'string' ? f.dimension : '';
        if (dim && !known.has(dim)) out.push(Object.freeze({ id: String(f.id ?? ''), dimension: dim }));
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return Object.freeze(out);
}
