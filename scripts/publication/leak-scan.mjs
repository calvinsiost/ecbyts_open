#!/usr/bin/env node
// leak-scan.mjs — ECBYTS-OPEN-LOCAL-001 F2 (§2.5) — gate BLOQUEANTE
// ============================================================================
// Varre o diretório TARGET (repo público candidato) por segredos, PII e
// artefatos internos ANTES de qualquer commit/publicação.
//
//   exit 0 → 0 matches, publicação pode prosseguir
//   exit 1 → matches listados (redigidos), NADA é publicado
//
// Usage:
//   node scripts/publication/leak-scan.mjs [--target=PATH]
//   npm run leak:scan [-- --target=PATH]
//
// Default target: ../ecbyts_open (relativo à raiz do repo privado).
// Padrões canônicos: scripts/publication/_leakScanPure.mjs (§2.5).
// Também roda embutido no extract-to-open.mjs, sobre o plano em memória,
// ANTES de escrever no target.
// ============================================================================

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SKIP_DIRS,
    formatReport,
    isTextFile,
    scanContent,
    scanFilename,
} from './_leakScanPure.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/**
 * Varre recursivamente `targetDir` e devolve findings + contagem.
 * Exportada para o extract-to-open.mjs e para os testes.
 */
export function runLeakScan(targetDir) {
    const findings = [];
    let scanned = 0;
    const walk = (dirAbs, relPrefix) => {
        for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
            const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
            const abs = path.join(dirAbs, entry.name);
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name)) continue;
                walk(abs, rel);
                continue;
            }
            if (!entry.isFile()) continue;
            scanned++;
            findings.push(...scanFilename(rel));
            if (isTextFile(rel)) {
                let content;
                try {
                    content = readFileSync(abs, 'utf8');
                } catch {
                    continue;
                }
                if (content.includes(String.fromCharCode(0))) continue; // binário disfarçado
                findings.push(...scanContent(rel, content));
            }
        }
    };
    walk(targetDir, '');
    return { findings, scanned };
}

function main() {
    const args = process.argv.slice(2);
    const targetArg = args.find((a) => a.startsWith('--target='));
    const target = targetArg
        ? path.resolve(targetArg.replace('--target=', ''))
        : path.resolve(repoRoot, '..', 'ecbyts_open');

    console.log('leak-scan (ECBYTS-OPEN-LOCAL-001 §2.5) — gate bloqueante');
    console.log(`Target: ${target}`);

    if (!existsSync(target) || !statSync(target).isDirectory()) {
        console.error(`ERRO: target não existe ou não é diretório: ${target}`);
        process.exit(2);
    }

    const { findings, scanned } = runLeakScan(target);
    console.log(formatReport(findings, scanned));
    process.exit(findings.length ? 1 : 0);
}

const invokedDirectly =
    process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
