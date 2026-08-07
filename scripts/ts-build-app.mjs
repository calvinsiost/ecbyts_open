#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import ts from 'typescript';
// TOOLING-PERF-001 §8 (RF-4/WS4): decisão do escape hatch full-build é pura e
// testada (tests/ciq-daemon-logic.test.mjs, gate-proven).
import { shouldForceFullBuild } from './_ciqDaemonPure.mjs';
// BUILD-EVOLUTION-001#orfaos-recontagem-256: o mapa é GERADO, não mantido à mão.
import { buildMappings, diffMappings, toPosix } from './_tsMigrationMapPure.mjs';
// BUILD-EVOLUTION-001#builds-concorrentes-corrompem-appjs: TODA escrita em
// app/js passa por writeFileAtomic (tmp+rename) — dois builds simultâneos no
// tree compartilhado rasgavam o arquivo para o leitor concorrente
// (falso-vermelho medido 2026-07-18, ethSigner.js).
import { writeFileAtomic } from './_writeFileAtomic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_ROOT = path.join(ROOT, 'src/app/js');
const MAP_PATH = path.join(ROOT, 'scripts/ts-migration-map.json');
const ALLOWLIST_PATH = path.join(ROOT, 'scripts/ts-migration-allowlist.json');
const prettierConfig = {
    singleQuote: true,
    semi: true,
    tabWidth: 4,
    trailingComma: 'all',
    printWidth: 120,
    endOfLine: 'lf',
    arrowParens: 'always',
};

function walkTs(dir, acc = []) {
    if (!fs.existsSync(dir)) return acc;
    for (const name of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, name);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkTs(fullPath, acc);
        } else if (fullPath.endsWith('.ts')) {
            acc.push(fullPath);
        }
    }
    return acc;
}

const migratedSources = walkTs(SRC_ROOT);

if (migratedSources.length === 0) {
    console.log('[ts-build-app] No migrated TS source found; build is a no-op for Phase 0.');
    process.exit(0);
}

// TOOLING-PERF-001 §8 rollback (RF-4/WS4): escape hatch CIQ_FULL_BUILD=1 (ou
// TS_BUILD_FORCE_FULL=1) força build COMPLETO removendo o tsBuildInfo do tsc
// incremental — toda a árvore é recompilada como antes do F3. Use quando o
// incremental ficar inconsistente (lição cache obsoleto 2026-06-18: limpar
// .runtime/tsbuildinfo-app-build antes de migrar .ts). Default = incremental.
const FORCE_FULL = shouldForceFullBuild(process.env);
const TSBUILDINFO = path.join(ROOT, '.runtime/tsbuildinfo-app-build');
if (FORCE_FULL && fs.existsSync(TSBUILDINFO)) {
    fs.rmSync(TSBUILDINFO, { force: true });
    console.log('[ts-build-app] CIQ_FULL_BUILD=1 → tsBuildInfo removido, build COMPLETO (escape hatch §8).');
}

const tscBin = path.join(ROOT, 'node_modules/typescript/bin/tsc');
// AUDIT-HARNESS-001#worktree-sem-junction: em worktree criado SEM o junction de
// node_modules (ex.: `git worktree add` cru), o tsc nao existe e o spawn abaixo
// saia com status 1 — que o codigo seguinte lia como "strict warnings" e seguia
// para a checagem de outputs, aceitando app/js PARCIAL/velho em silencio
// (falso-vermelho de ~291 imports quebrados no pre-push do adm-rf12, 2026-07-18).
// Falhar ruidosamente AQUI, com a acao corretiva, em vez de emitir parcial.
if (!fs.existsSync(tscBin)) {
    console.error(`[ts-build-app] ERRO FATAL: tsc nao encontrado em ${tscBin}`);
    console.error('[ts-build-app] Este worktree esta sem o junction de node_modules.');
    console.error('[ts-build-app] Corrija com (na raiz do repo principal):');
    console.error('[ts-build-app]   cmd /c mklink /J "<worktree>\\node_modules" "<raiz>\\node_modules"');
    console.error('[ts-build-app]   ou recrie o worktree com: node scripts/agent-worktree.mjs add <agente>');
    process.exit(1);
}
const result = spawnSync(process.execPath, [tscBin, '-p', 'tsconfig.app-build.json'], {
    cwd: ROOT,
    stdio: 'inherit',
});

if (result.error) {
    console.error('[ts-build-app] Failed to spawn tsc:', result.error.message);
    process.exit(1);
}

// tsc 6.x with strict + noUncheckedIndexedAccess returns exit 2 when ANY TS
// error is reported, even though it still emits the .js output (default
// noEmitOnError: false). Pre-phase 2 (2026-05-27), the committed .js mirror
// hid this — Vercel/Bluehost served the committed files without re-emitting.
// Post-phase 2: .js is gitignored, so CI invokes this codemod and emit MUST
// succeed. We tolerate tsc exit !== 0 if the per-mapping outputs all exist
// (validated in the loop below). Real spawn failures (result.error) still
// fail-fast above.
if (result.status !== 0) {
    console.warn(
        `[ts-build-app] tsc exited ${result.status} (likely TS strict warnings) — ` +
            `verifying emit succeeded via output existence check below...`,
    );
}

const migrationMap = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) : { mappings: [] };
const allowlist = fs.existsSync(ALLOWLIST_PATH)
    ? JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'))
    : { checkedJs: [] };
const checkedJs = new Set(allowlist.checkedJs || []);

// BUILD-EVOLUTION-001#orfaos-recontagem-256: avisa quando o mapa DERIVOU do disco.
// Enquanto o mapa era mantido à mão ele congelou em 2849 entradas e os órfãos
// cresceram 97 → 233 → 256 → 265 sem ninguém notar — porque nada no build dizia
// nada. Um módulo órfão compila (o tsconfig inclui src/app/js/**/*.ts), mas NÃO é
// coberto pelo check de emissão do build:clean-check: fica sem validação nenhuma.
// Aviso, não erro: um .ts recém-criado e ainda não commitado é rotina, e quebrar
// o build (logo, o deploy) por isso seria pior que a dívida. O gate duro vive em
// tests/ts-migration-map-generation.test.mjs.
const mapDrift = diffMappings(
    migrationMap.mappings || [],
    buildMappings(migratedSources.map((p) => toPosix(path.relative(ROOT, p)))),
);
if (!mapDrift.inSync) {
    console.warn(
        `[ts-build-app] AVISO: ts-migration-map.json fora de sincronia — ` +
            `${mapDrift.orphans.length} órfão(s), ${mapDrift.dangling.length} dangling, ` +
            `${mapDrift.mismatched.length} fora-da-regra.`,
    );
    for (const o of mapDrift.orphans.slice(0, 5)) console.warn(`[ts-build-app]   órfão: ${o}`);
    if (mapDrift.orphans.length > 5) console.warn(`[ts-build-app]   … +${mapDrift.orphans.length - 5}`);
    console.warn('[ts-build-app] Regenere com: node scripts/build-ts-migration-map.mjs --tracked');
}

for (const mapping of migrationMap.mappings || []) {
    if (!mapping.source || !mapping.output) continue;
    const sourcePath = path.join(ROOT, mapping.source);
    const outputPath = path.join(ROOT, mapping.output);
    if (!fs.existsSync(outputPath) && fs.existsSync(sourcePath)) {
        // When global TS strict errors exist elsewhere, tsc can skip an output
        // that is still needed by deploy. Preserve the TS source of truth and
        // regenerate this mirror with the same local transpile fallback used for
        // stale files below.
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        const transpiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                sourceMap: true,
            },
            fileName: sourcePath,
        });
        writeFileAtomic(outputPath, transpiled.outputText, 'utf8');
        if (transpiled.sourceMapText) {
            writeFileAtomic(`${outputPath}.map`, transpiled.sourceMapText, 'utf8');
        }
    }
    if (!fs.existsSync(outputPath)) {
        console.error(`[ts-build-app] mapped output missing after build: ${mapping.output}`);
        process.exit(1);
    }
    // Aggressive warning header to prevent LLM agents (Claude/Codex/KIMI/Gemini)
    // from reading this derived .js when the canonical .ts exists. The previous
    // single-line header was being scrolled past during long Read operations
    // (Calvin incident 2026-05-27: bountyPanel.js, constellationControls.js,
    // homeGrid.js all read as .js instead of canonical .ts in src/).
    //
    // 10-line block survives scroll-past and is parseable by both humans and LLMs.
    const generatedHeader =
        `// ============================================================================\n` +
        `// !!  DO NOT READ OR EDIT THIS FILE — IT IS AUTO-GENERATED DERIVED OUTPUT  !!\n` +
        `// ============================================================================\n` +
        `// CANONICAL SOURCE: ${mapping.source}\n` +
        `// Generated by    : scripts/ts-build-app.mjs (TS-MIGRATION-001)\n` +
        `// Type-richness   : THIS FILE HAS TYPES STRIPPED TO JSDoc — read the .ts instead.\n` +
        `// Idempotency     : edits here are OVERWRITTEN on every \`node scripts/ts-build-app.mjs\` run.\n` +
        `// LLM AGENTS      : stop reading now. Open ${mapping.source} for canonical signatures.\n` +
        `// Repo signal     : .gitattributes marks this path linguist-generated=true.\n` +
        `// ============================================================================\n`;
    const header = checkedJs.has(mapping.output) ? `// @ts-check\n${generatedHeader}` : generatedHeader;
    let current = fs.readFileSync(outputPath, 'utf8');
    const sourceStat = fs.existsSync(sourcePath) ? fs.statSync(sourcePath) : null;
    const outputStat = fs.statSync(outputPath);
    const outputIsFresh = !sourceStat || outputStat.mtimeMs >= sourceStat.mtimeMs;

    if (current.startsWith(header) && !outputIsFresh && sourceStat) {
        // When global strict errors exist elsewhere, tsc may leave one derived
        // mirror stale. Transpile the changed source locally so deploy mirrors
        // still match canonical TS.
        const transpiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ESNext,
                sourceMap: true,
            },
            fileName: sourcePath,
        });
        writeFileAtomic(outputPath, transpiled.outputText, 'utf8');
        if (transpiled.sourceMapText) {
            writeFileAtomic(`${outputPath}.map`, transpiled.sourceMapText, 'utf8');
        }
        current = fs.readFileSync(outputPath, 'utf8');
    }
    // TOOLING-PERF-001 F3 (claude - adm 2026-06-10): com tsc incremental, só os
    // arquivos RECOMPILADOS são re-emitidos pelo tsc (perdendo o header). Quem já
    // começa com o header exato desta versão não foi re-emitido → skip do prettier
    // (que custava ~16s sobre 2695 files mesmo sem nenhuma mudança). Qualquer
    // divergência (header antigo, ausente, source renomeado) cai no caminho cheio.
    if (current.startsWith(header) && outputIsFresh) {
        continue;
    }
    // Strip prior headers — both old single-line and new 10-line variants.
    const stripped = current
        .replace(/^\/\/ @ts-check\r?\n/, '')
        .replace(/^\/\/ ={10,}\r?\n\/\/ !! {1,2}DO NOT READ[^\n]*\r?\n(\/\/[^\n]*\r?\n){8}\/\/ ={10,}\r?\n/, '')
        .replace(/^\/\/ Generated from .* by TS-MIGRATION-001\. Do not edit manually\.\r?\n/, '')
        .replace(/^\/\/ @ts-check\r?\n/, '');
    const formatted = await prettier.format(`${header}${stripped}`, { ...prettierConfig, parser: 'babel' });
    writeFileAtomic(outputPath, formatted, 'utf8');
}

console.log(`[ts-build-app] Built ${migratedSources.length} TS source file(s).`);
process.exit(0);
