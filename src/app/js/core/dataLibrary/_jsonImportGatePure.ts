// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * _jsonImportGatePure — IP-DATA-CONSOL-001 RF-5 (deprecation gate)
 *
 * Decisor pure do lint ratchet que BLOQUEIA novos imports estáticos de JSON
 * classificado como `proprietary-core`. Substitui imports de catálogo IP por
 * `await fetchDataset(key)` (RF-4 `_dataFetcherPure`).
 *
 * Spec §2 RF-5: "lint rule (ratchet) bloqueia novos
 *   `import x from './**\/*.json'` para JSONs classificados como
 *   proprietary-core".
 *
 * Garante (mesmas invariantes de core/dataLibrary/ — ver ADR.md):
 *  - Pure-logic only — nenhum import de fs/path/network; o classificador de
 *    tier do alvo é INJETADO (DI), espelhando o critério de
 *    scripts/ip-data-inventory.mjs sem acoplar I/O.
 *  - Immutable contracts — todas as estruturas retornadas Object.freeze.
 *  - Parsing determinístico — regex string-aware sobre o texto do módulo,
 *    cobrindo as 3 formas de import JSON suportadas pela plataforma.
 *
 * O wire de I/O (varrer src/app/js/**, resolver paths relativos, comparar
 * contra .runtime baseline) vive num CLI separado em scripts/ — este módulo
 * só decide, dado o texto + um classificador, o que é violação.
 */

/** Tier de IP do alvo do import (espelha ip-data-inventory.mjs). */
export type ImportTargetTier = 'public-open' | 'derived-curated' | 'proprietary-core' | 'unknown';

/** Forma sintática do import detectado. */
export type JsonImportKind = 'static_default' | 'static_named' | 'dynamic' | 'import_attribute';

export interface JsonImport {
    /** Specifier literal exatamente como escrito no source (ex: './profiles/conama-420.json'). */
    readonly specifier: string;
    /** Forma sintática detectada. */
    readonly kind: JsonImportKind;
    /** Linha 1-based onde o import foi encontrado (para mensagem actionable `<file>:<line>`). */
    readonly line: number;
}

export interface GateViolation {
    readonly specifier: string;
    readonly kind: JsonImportKind;
    readonly line: number;
    readonly tier: ImportTargetTier;
    /** Mensagem actionable (grammar §OBSERVABILIDADE) com o fix sugerido. */
    readonly message: string;
}

export interface GateReport {
    readonly imports: readonly JsonImport[];
    readonly violations: readonly GateViolation[];
    readonly clean: boolean;
}

/**
 * Classificador injetável: dado o specifier do import, retorna o tier de IP do
 * alvo. O wire real resolve o path e consulta inventory.json; testes passam um
 * mapa fixo. `null`/`undefined` → tratado como 'unknown' (não bloqueia).
 */
export type TierClassifier = (specifier: string) => ImportTargetTier | null | undefined;

const JSON_SPECIFIER = /\.json(['"`])/; // termina em .json antes do fecho de string

/**
 * Remove comentários de linha (`//...`) e bloco (`/* ... *\/`) para evitar
 * falsos positivos em imports comentados. Não tenta lidar com strings que
 * contenham `//` — aceitável para o domínio de detecção de import.
 */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (_m, p1) => p1);
}

function lineOf(src: string, index: number): number {
    let line = 1;
    for (let i = 0; i < index && i < src.length; i++) {
        if (src.charCodeAt(i) === 10) line++;
    }
    return line;
}

/**
 * Extrai todos os imports de arquivos `.json` de um módulo TS/JS.
 *
 * Cobre as 3 formas suportadas na plataforma vanilla ESM:
 *  1. `import data from './x.json'`              → static_default
 *  2. `import { a } from './x.json'`             → static_named
 *  3. `import './x.json'` / `await import('./x.json')` → dynamic
 *  4. `import x from './x.json' with { type: 'json' }` → import_attribute
 *
 * Determinístico: ordena por posição (linha) ascendente.
 */
export function parseJsonImports(source: string): JsonImport[] {
    if (typeof source !== 'string' || source.length === 0) return [];
    const src = stripComments(source);
    const found: JsonImport[] = [];

    // Static import ... from '...json'  (default, named, side-effect-with-from)
    const staticRe = /\bimport\b([^;'"`]*?)\bfrom\s*(['"`])([^'"`]+?)\2(\s*with\s*\{[^}]*\})?/g;
    for (let m = staticRe.exec(src); m !== null; m = staticRe.exec(src)) {
        const spec = m[3];
        if (!spec || !/\.json$/.test(spec)) continue;
        const clause = (m[1] || '').trim();
        const hasAttr = Boolean(m[4]);
        const kind: JsonImportKind = hasAttr ? 'import_attribute' : clause.includes('{') ? 'static_named' : 'static_default';
        found.push(Object.freeze({ specifier: spec, kind, line: lineOf(src, m.index) }));
    }

    // Side-effect static import '...json' (sem `from`)
    const sideRe = /\bimport\s*(['"`])([^'"`]+?)\1\s*;/g;
    for (let m = sideRe.exec(src); m !== null; m = sideRe.exec(src)) {
        const spec = m[2];
        if (!spec || !/\.json$/.test(spec)) continue;
        found.push(Object.freeze({ specifier: spec, kind: 'dynamic', line: lineOf(src, m.index) }));
    }

    // Dynamic import('...json')
    const dynRe = /\bimport\s*\(\s*(['"`])([^'"`]+?)\1/g;
    for (let m = dynRe.exec(src); m !== null; m = dynRe.exec(src)) {
        const spec = m[2];
        if (!spec) continue;
        if (!JSON_SPECIFIER.test(spec + '"')) continue;
        if (!/\.json$/.test(spec)) continue;
        found.push(Object.freeze({ specifier: spec, kind: 'dynamic', line: lineOf(src, m.index) }));
    }

    // Dedup por (specifier+line+kind) e ordena determinístico
    const seen = new Set<string>();
    const deduped = found.filter((imp) => {
        const key = `${imp.line}|${imp.kind}|${imp.specifier}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    deduped.sort((a, b) => a.line - b.line || a.specifier.localeCompare(b.specifier));
    return deduped;
}

function buildMessage(spec: string, line: number): string {
    return (
        `proprietary-core JSON import bloqueado em :${line} → '${spec}'. ` +
        `Substitua o import estático por await fetchDataset(key) (RF-4 _dataFetcherPure) ` +
        `com tier gate; o catálogo deve viver em Supabase, não embarcado.`
    );
}

/**
 * Aplica o gate: dado o conjunto de imports JSON e um classificador de tier,
 * retorna as violações (apenas tier `proprietary-core` bloqueia).
 *
 * `public-open`, `derived-curated`, `unknown` NÃO bloqueiam — o gate é
 * cirúrgico ao IP de pesquisa (EIS bands, uncertainty libs) conforme RF-5.
 */
export function decideJsonImportGate(imports: readonly JsonImport[], classify: TierClassifier): GateReport {
    const list = Array.isArray(imports) ? imports : [];
    const violations: GateViolation[] = [];
    for (const imp of list) {
        const tier = classify(imp.specifier) ?? 'unknown';
        if (tier === 'proprietary-core') {
            violations.push(
                Object.freeze({
                    specifier: imp.specifier,
                    kind: imp.kind,
                    line: imp.line,
                    tier,
                    message: buildMessage(imp.specifier, imp.line),
                }),
            );
        }
    }
    return Object.freeze({
        imports: Object.freeze([...list]),
        violations: Object.freeze(violations),
        clean: violations.length === 0,
    });
}

/**
 * Conveniência: parse + decide em uma chamada (um arquivo).
 */
export function gateSource(source: string, classify: TierClassifier): GateReport {
    return decideJsonImportGate(parseJsonImports(source), classify);
}

/**
 * Resolve um specifier de import RELATIVO ao path (repo-relative, POSIX) do
 * arquivo que o contém — pure, sem tocar `fs`. Espelha a semântica de
 * resolução de módulo ESM o suficiente para o ratchet (RF-5): só lida com
 * specifiers relativos (`./` / `../`); bare/absolute/URL specifiers retornam
 * `null` (não são JSON embarcado do repo, logo nunca bloqueiam).
 *
 * Determinístico e independente de plataforma: opera só sobre strings com `/`.
 * O CLI normaliza os paths do SO para POSIX antes de chamar.
 *
 * @example resolveSpecifierToRepoPath('src/app/js/core/x/a.ts', './b.json')
 *          → 'src/app/js/core/x/b.json'
 * @example resolveSpecifierToRepoPath('src/app/js/core/x/a.ts', '../y/c.json')
 *          → 'src/app/js/core/y/c.json'
 */
export function resolveSpecifierToRepoPath(fromRepoPath: string, specifier: string): string | null {
    if (typeof fromRepoPath !== 'string' || typeof specifier !== 'string') return null;
    if (!(specifier.startsWith('./') || specifier.startsWith('../'))) return null;

    const fromPosix = fromRepoPath.replace(/\\/g, '/');
    const dir = fromPosix.includes('/') ? fromPosix.slice(0, fromPosix.lastIndexOf('/')) : '';
    const baseSegs = dir.length ? dir.split('/') : [];
    const specSegs = specifier.replace(/\\/g, '/').split('/');

    const out: string[] = [...baseSegs];
    for (const seg of specSegs) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..') {
            if (out.length === 0) return null; // escapa a raiz → fora do repo
            out.pop();
            continue;
        }
        out.push(seg);
    }
    return out.join('/');
}

/**
 * Constrói um {@link TierClassifier} ligado a UM arquivo de origem: resolve o
 * specifier relativo contra `fromRepoPath` e consulta o mapa
 * `tierByRepoPath` (proveniente do inventory). Imports não resolvíveis ou
 * ausentes do mapa caem em 'unknown' (não bloqueiam — RF-5 é cirúrgico a
 * proprietary-core). Pure: o mapa é injetado, zero I/O.
 */
export function makeFileTierClassifier(
    fromRepoPath: string,
    tierByRepoPath: Readonly<Record<string, ImportTargetTier>>,
): TierClassifier {
    const map = tierByRepoPath && typeof tierByRepoPath === 'object' ? tierByRepoPath : {};
    return (specifier: string): ImportTargetTier => {
        const resolved = resolveSpecifierToRepoPath(fromRepoPath, specifier);
        if (resolved === null) return 'unknown';
        const tier = map[resolved];
        return tier === 'public-open' || tier === 'derived-curated' || tier === 'proprietary-core' ? tier : 'unknown';
    };
}

export interface GateRatchetSummary {
    readonly filesScanned: number;
    readonly totalJsonImports: number;
    readonly totalViolations: number;
    /** Ratchet: a contagem atual <= baseline? (regressão se false). */
    readonly withinBaseline: boolean;
    readonly baseline: number;
}

/**
 * Agrega múltiplos GateReport (1 por arquivo) num resumo ratchet-friendly.
 * `baseline` default 0 (zero-regressão é o alvo RF-5 para greenfield).
 */
export function summarizeRatchet(reports: readonly GateReport[], baseline = 0): GateRatchetSummary {
    const list = Array.isArray(reports) ? reports : [];
    let totalJsonImports = 0;
    let totalViolations = 0;
    for (const r of list) {
        totalJsonImports += r.imports.length;
        totalViolations += r.violations.length;
    }
    const safeBaseline = Number.isFinite(baseline) && baseline >= 0 ? Math.floor(baseline) : 0;
    return Object.freeze({
        filesScanned: list.length,
        totalJsonImports,
        totalViolations,
        withinBaseline: totalViolations <= safeBaseline,
        baseline: safeBaseline,
    });
}
