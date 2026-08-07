// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0-only.

/**
 * Runtime do livro-razão de degradações — o `degradeWith` que os pontos de
 * fallback usam no lugar de `.catch(() => valor)` mudo.
 *
 * REGRA (Calvin, 2026-08-06): *todo mecanismo de degradação precisa deixar
 * rastro*. Antes: 54 degradações de CAPACIDADE em `src/app/js` sumiam sem
 * contador (15 em fetch/rede, 21 em `import()`, 18 devolvendo vazio como se
 * fosse resultado) — o usuário perdia função e ninguém sabia.
 *
 * Uso típico (substitui o catch mudo, MANTENDO o mesmo fallback):
 *   const txt = await fetch(url).then(r => r.text())
 *       .catch(degradeWith('ingestion:pdfplumber', 'network', ''));
 *
 * O helper devolve uma FUNÇÃO de catch: registra e devolve o fallback. O
 * comportamento do app não muda — só deixa de ser invisível.
 *
 * Não é telemetria: nada sai da máquina. O painel de diagnóstico e o Reportar
 * Bug leem o resumo; envio externo só existiria com consentimento, noutro lugar.
 * A lógica pura vive em `_degradationLedgerPure.ts` (testável sem DOM).
 */
import {
    emptyLedger,
    recordDegradation,
    summarizeLedger,
    isScreaming,
    type DegradationKind,
    type DegradationLedger,
} from './_degradationLedgerPure.js';

let _ledger: DegradationLedger = emptyLedger();

/** Limiar a partir do qual um ponto "está gritando" e vira console.warn. */
const SCREAM_AT = 5;

/** Registra uma degradação. Devolve o próprio fallback, para encadear. */
export function noteDegradation<T>(
    id: string,
    kind: DegradationKind,
    reason: unknown,
    fallback: T,
): T {
    _ledger = recordDegradation(_ledger, { id, kind, reason, at: Date.now() });
    const entry = _ledger.entries[id];
    // Um ponto que dispara MUITO não é exceção rara — é capacidade quebrada.
    // Sobe de debug para warn nesse ponto, que é o sinal que faltava.
    const msg = `[degraded:${kind}] ${id} (${entry?.count}×): ${entry?.lastReason || '—'}`;
    if (isScreaming(entry, SCREAM_AT)) console.warn(msg);
    else console.debug(msg);
    return fallback;
}

/**
 * Fábrica de handler de catch — a forma que substitui `.catch(() => valor)`.
 * @example .catch(degradeWith('llm:localEngine', 'network', null))
 */
export function degradeWith<T>(id: string, kind: DegradationKind, fallback: T) {
    return (reason?: unknown): T => noteDegradation(id, kind, reason, fallback);
}

/** Resumo para o painel de diagnóstico / Reportar Bug. */
export function getDegradationSummary(limit = 10) {
    return summarizeLedger(_ledger, limit);
}

/** Só para testes e para o botão "limpar" do painel. */
export function resetDegradationLedger(): void {
    _ledger = emptyLedger();
}

// Exposto no window para o painel de diagnóstico, o Reportar Bug e a inspeção
// manual do Calvin no console ("quantas vezes o app degradou nesta sessão?").
try {
    (globalThis as any).__ecbytsDegradations = getDegradationSummary;
} catch (e: any) {
    console.debug('[degradationLedger:expose]', e?.message || e);
}
