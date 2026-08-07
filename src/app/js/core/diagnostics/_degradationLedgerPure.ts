// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0-only.

/**
 * LIVRO-RAZÃO DE DEGRADAÇÕES — pure logic.
 *
 * REGRA DO CALVIN (2026-08-06, "how not fail again"): *todo mecanismo de
 * degradação precisa deixar rastro — o dia em que ele é acionado o tempo todo,
 * ninguém percebe.*
 *
 * De onde veio: os 4 bugs achados por ele num único dia eram todos PROTEÇÕES
 * que, ao evitarem o crash, APAGARAM O SINAL — `.catch(() => {})` engolindo
 * erro; stub truthy fazendo `if (requireAuth()) return` abortar sempre; fallback
 * i18n exibindo texto legível no idioma errado; CSS adiado abrindo painel sem
 * estilo. Nenhum quebrou nada — por isso passaram por baterias verdes.
 *
 * Escopo medido em 2026-08-06: 54 degradações de CAPACIDADE sem rastro em
 * `src/app/js` (15 em fetch/rede, 21 em `import()` dinâmico, 18
 * default-esconde-vazio) contra apenas 6 arquivos com qualquer contador.
 *
 * O que este módulo NÃO é: não é telemetria (não envia nada), não é tratamento
 * de erro (não decide o fallback) e não substitui `console.debug` — ele só
 * CONTA e guarda a última ocorrência, para que a degradação deixe de ser
 * invisível. Puro: sem DOM, sem rede, sem Date.now implícito.
 */

/** Categoria da capacidade que degradou — o que o usuário perde. */
export type DegradationKind =
    | 'network' // fetch/API indisponível
    | 'module' // import() dinâmico que não carregou
    | 'storage' // localStorage/IndexedDB negado ou cheio
    | 'style' // folha de estilo que não aplicou
    | 'i18n' // tradução ausente (caiu no fallback)
    | 'feature'; // capacidade desligada por flag/gate

export interface DegradationEntry {
    /** Identificador estável do ponto de degradação (ex.: 'ingestion:pdfplumber'). */
    readonly id: string;
    readonly kind: DegradationKind;
    /** Quantas vezes disparou nesta sessão. */
    readonly count: number;
    /** Motivo da ÚLTIMA ocorrência (mensagem de erro, curta). */
    readonly lastReason: string;
    /** Marca de tempo da última ocorrência (ms epoch), injetada pelo caller. */
    readonly lastAt: number;
}

export interface DegradationLedger {
    readonly entries: Readonly<Record<string, DegradationEntry>>;
    /** Soma de todos os `count` — "o app degradou N vezes nesta sessão". */
    readonly total: number;
}

/** Livro-razão vazio (estado inicial). PURO. */
export function emptyLedger(): DegradationLedger {
    return { entries: {}, total: 0 };
}

/** Corta a razão para caber num log/painel sem virar parede de texto. */
function shortReason(reason: unknown): string {
    const s = reason instanceof Error ? reason.message : String(reason ?? '');
    return s.replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Registra UMA ocorrência de degradação. Imutável: devolve um livro novo — o
 * caller decide onde guardar (o runtime usa um módulo-singleton).
 *
 * Idempotente por `id`: a segunda chamada do mesmo ponto incrementa o contador
 * em vez de criar entrada nova — é isso que revela "está disparando sempre".
 * PURO.
 */
export function recordDegradation(
    ledger: DegradationLedger,
    input: { id: string; kind: DegradationKind; reason?: unknown; at: number },
): DegradationLedger {
    const id = String(input.id || '').trim();
    if (!id) return ledger; // sem id não há como agregar — ignora em vez de poluir
    const prev = ledger.entries[id];
    const entry: DegradationEntry = {
        id,
        kind: input.kind,
        count: (prev?.count ?? 0) + 1,
        lastReason: shortReason(input.reason),
        lastAt: input.at,
    };
    return {
        entries: { ...ledger.entries, [id]: entry },
        total: ledger.total + 1,
    };
}

/**
 * Resumo legível para o painel de diagnóstico e para o relatório de bug.
 * Ordena por frequência (o que mais dispara aparece primeiro) — um ponto com
 * count alto é o sinal de "capacidade quebrada, não exceção rara". PURO.
 */
export function summarizeLedger(ledger: DegradationLedger, limit = 10): {
    total: number;
    distintos: number;
    porKind: Record<string, number>;
    top: readonly DegradationEntry[];
} {
    const lista = Object.values(ledger.entries);
    const porKind: Record<string, number> = {};
    for (const e of lista) porKind[e.kind] = (porKind[e.kind] ?? 0) + e.count;
    const top = [...lista].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, limit);
    return { total: ledger.total, distintos: lista.length, porKind, top };
}

/**
 * Um ponto de degradação está "gritando"? (disparou muito numa sessão só).
 * É a pergunta que a regra do Calvin quer respondida automaticamente: *se isto
 * disparar 100% das vezes, alguém saberia?* — agora sim. PURO.
 */
export function isScreaming(entry: DegradationEntry | undefined, threshold = 5): boolean {
    return !!entry && entry.count >= threshold;
}
