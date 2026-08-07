// BUILD-EVOLUTION-001#builds-concorrentes-corrompem-appjs: escrita ATÔMICA
// (tmp no mesmo dir + rename) para que um leitor concorrente NUNCA veja estado
// parcial de um arquivo. Causa-raiz medida em 2026-07-18: dois ts-build-app
// simultâneos no tree compartilhado — o prettier leu app/js/core/ownership/
// ethSigner.js RASGADO (duas escritas sobrepostas) e morreu com SyntaxError,
// gerando falso-vermelho. renameSync é atômico dentro do mesmo volume
// (POSIX rename(2); no Windows libuv usa MoveFileEx com
// MOVEFILE_REPLACE_EXISTING, que também sobrescreve o destino existente).
// NÃO resolve dois tsc emitindo ao mesmo tempo (emit do tsc é interno) —
// resolve o leitor (prettier do próprio build, ciq-daemon, build-app-cached,
// navegador dev) nunca ler conteúdo parcial.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// No Windows, rename por cima de um destino que um leitor concorrente tem
// ABERTO naquele instante falha com EPERM/EEXIST/EBUSY (MoveFileEx não
// substitui arquivo em uso sem FILE_SHARE_DELETE). O leitor (prettier,
// readFileSync) segura o arquivo por microssegundos — retry curto resolve.
// Falso-vermelho NÃO: se esgotar as tentativas, lança (falha ruidosa) em vez
// de cair para escrita não-atômica.
const RENAME_RETRY_CODES = new Set(['EPERM', 'EEXIST', 'EBUSY', 'EACCES']);
const RENAME_MAX_ATTEMPTS = 200; // 200 x ~5ms ≈ 1s de teto
const RENAME_RETRY_MS = 5;

function sleepSync(ms) {
    const view = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(view, 0, 0, ms);
}

function renameSyncWithRetry(tmp, filePath) {
    for (let attempt = 1; ; attempt++) {
        try {
            fs.renameSync(tmp, filePath);
            return;
        } catch (err) {
            if (!RENAME_RETRY_CODES.has(err.code) || attempt >= RENAME_MAX_ATTEMPTS) throw err;
            sleepSync(RENAME_RETRY_MS);
        }
    }
}

/**
 * Escreve `data` em `filePath` de forma atômica: grava num arquivo temporário
 * único no MESMO diretório (mesmo volume → rename atômico) e renomeia por cima
 * do destino. Em caso de erro, remove o tmp e relança a exceção original.
 * @param {string} filePath destino final
 * @param {string|Buffer} data conteúdo completo
 * @param {object|string} [options] igual ao de fs.writeFileSync (default 'utf8')
 */
export function writeFileAtomic(filePath, data, options = 'utf8') {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    const tmp = path.join(dir, `.${base}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
    try {
        fs.writeFileSync(tmp, data, options);
        renameSyncWithRetry(tmp, filePath);
    } catch (err) {
        try {
            fs.rmSync(tmp, { force: true });
        } catch {
            // tmp já movido ou já removido — nada a fazer
        }
        throw err;
    }
}
