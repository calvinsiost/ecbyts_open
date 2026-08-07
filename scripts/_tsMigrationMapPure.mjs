#!/usr/bin/env node
/**
 * _tsMigrationMapPure — lógica pura do registry `scripts/ts-migration-map.json`
 * (BUILD-EVOLUTION-001#orfaos-recontagem-256).
 *
 * POR QUE ESTE MÓDULO EXISTE
 * O mapa era mantido À MÃO: cada novo `src/app/js/**` .ts precisava de uma entrada
 * manual. Como ninguém adiciona, o mapa CONGELA enquanto o repo cresce — e todo
 * módulo novo nasce órfão. A dívida foi medida 4 vezes com 4 números diferentes
 * (97 → 233 → 256 → 265) porque a cada medição o repo tinha crescido de novo.
 * Em 2026-07-18, num ÚNICO dia, os órfãos saíram de 254 para 265 (~40 commits)
 * sem que o mapa mudasse uma linha (2849 mappings desde d9737e1f).
 *
 * Órfão = módulo cujo output derivado NINGUÉM valida: `clean-checkout-build-check`
 * só cobra emissão dos mapeados, então 265 arquivos passavam sem verificação.
 *
 * A regra de derivação é 100% determinística e foi verificada contra as 2849
 * entradas legadas (zero violações): `src/app/js/X.ts` → `app/js/X.js`. Sendo
 * determinística, manter a lista à mão é puro custo — daí a GERAÇÃO.
 *
 * Pure = sem I/O (o CLI faz o walk do disco e passa os caminhos para cá).
 * Testado em tests/ts-migration-map-generation.test.mjs.
 */

/** Raiz canônica do TypeScript (source of truth). */
export const TS_SOURCE_ROOT = 'src/app/js';
/** Raiz do JavaScript derivado (gitignored, NUNCA editar à mão). */
export const JS_OUTPUT_ROOT = 'app/js';
/** schemaVersion gravado no JSON — mantido igual ao legado para não quebrar leitores. */
export const SCHEMA_VERSION = 1;

/**
 * Normaliza separador de caminho para POSIX (o mapa é sempre gravado com `/`,
 * inclusive quando gerado no Windows).
 * @param {string} filePath
 * @returns {string}
 */
export function toPosix(filePath) {
    return String(filePath ?? '')
        .split('\\')
        .join('/');
}

/**
 * Um caminho entra no mapa? Precisa ser `.ts` sob src/app/js e NÃO ser `.d.ts`.
 *
 * `.d.ts` são declarações puras: o tsc não emite `.js` para elas, então mapeá-las
 * criaria um output que nunca existe e o check de emissão falharia para sempre.
 * As 2849 entradas legadas confirmam a regra (zero `.d.ts` no mapa).
 *
 * @param {string} relativePath — caminho relativo à raiz do repo
 * @returns {boolean}
 */
export function isMappableSource(relativePath) {
    const p = toPosix(relativePath);
    return p.startsWith(`${TS_SOURCE_ROOT}/`) && p.endsWith('.ts') && !p.endsWith('.d.ts');
}

/**
 * Regra de derivação source → output. Verificada contra as 2849 entradas legadas
 * do mapa mantido à mão: ZERO divergências.
 *
 * @param {string} relativePath — ex. `src/app/js/core/foo.ts`
 * @returns {string} ex. `app/js/core/foo.js`
 * @throws {Error} se o caminho não for mapeável (falha alto, nunca silenciosa)
 */
export function sourceToOutput(relativePath) {
    const p = toPosix(relativePath);
    if (!isMappableSource(p)) {
        throw new Error(`[ts-migration-map] caminho não-mapeável: ${p}`);
    }
    return `${JS_OUTPUT_ROOT}/${p.slice(TS_SOURCE_ROOT.length + 1).replace(/\.ts$/, '.js')}`;
}

/**
 * Constrói a lista COMPLETA de mappings a partir dos caminhos encontrados no disco.
 * Ordena por `source` para que o arquivo gerado seja determinístico — assim um
 * módulo novo vira +1 linha no lugar certo do diff, não um append em posição
 * arbitrária (o legado NÃO era ordenado).
 *
 * @param {string[]} relativePaths — todos os arquivos vistos sob o repo
 * @returns {{ source: string, output: string }[]}
 */
export function buildMappings(relativePaths) {
    const sources = [...new Set((relativePaths || []).map(toPosix).filter(isMappableSource))];
    sources.sort();
    return sources.map((source) => ({ source, output: sourceToOutput(source) }));
}

/**
 * Compara o mapa em disco com o mapa gerado e classifica a deriva.
 *
 * - `orphans`   — .ts existe em src mas NÃO está no mapa (a dívida deste item)
 * - `dangling`  — entrada no mapa cujo .ts sumiu (lixo que mascara emissão)
 * - `mismatched`— entrada cujo `output` não segue a regra de derivação
 *
 * @param {{source:string,output:string}[]} current — mappings lidos do JSON
 * @param {{source:string,output:string}[]} generated — mappings derivados do disco
 * @returns {{orphans:string[], dangling:string[], mismatched:{source:string,output:string,expected:string}[], inSync:boolean}}
 */
export function diffMappings(current, generated) {
    const cur = (current || [])
        .filter((e) => e && e.source && e.output)
        .map((e) => ({
            source: toPosix(e.source),
            output: toPosix(e.output),
        }));
    const gen = generated || [];
    const curBySource = new Map(cur.map((e) => [e.source, e.output]));
    const genBySource = new Map(gen.map((e) => [e.source, e.output]));

    const orphans = gen.filter((e) => !curBySource.has(e.source)).map((e) => e.source);
    const dangling = cur.filter((e) => !genBySource.has(e.source)).map((e) => e.source);
    const mismatched = [];
    for (const e of cur) {
        const expected = genBySource.get(e.source);
        if (expected && expected !== e.output) {
            mismatched.push({ source: e.source, output: e.output, expected });
        }
    }
    return {
        orphans,
        dangling,
        mismatched,
        inSync: orphans.length === 0 && dangling.length === 0 && mismatched.length === 0,
    };
}

/**
 * Serializa o mapa no formato EXATO do arquivo legado: JSON com indentação de 4,
 * quebras LF (`.gitattributes` não normaliza scripts/*.json; o blob em git é LF)
 * e newline final. Determinístico: mesma entrada ⇒ mesmos bytes.
 *
 * @param {{source:string,output:string}[]} mappings
 * @param {number} [schemaVersion]
 * @returns {string}
 */
export function serializeMap(mappings, schemaVersion = SCHEMA_VERSION) {
    const body = JSON.stringify({ schemaVersion, mappings: mappings || [] }, null, 4);
    return `${body.split('\r\n').join('\n')}\n`;
}
