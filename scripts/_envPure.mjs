/**
 * _envPure — leitor UNICO e testavel de variaveis do `.env.local` da raiz.
 *
 * API
 * ---
 * parseEnvContent(text) -> Record<string, string>
 *   Parse PURO do conteudo de um .env (sem I/O):
 *     - ignora linhas vazias e comentarios (#);
 *     - aceita prefixo `export `;
 *     - split no PRIMEIRO `=` (valor pode conter `=`);
 *     - trim na chave e no valor;
 *     - remove aspas simples/duplas ENVOLVENTES do valor.
 *
 * getEnvLocal(key, opts?) -> string | undefined
 *   opts: { required=false, envMap=<lido do .env.local>, processEnv=process.env,
 *           envPath=<ROOT/.env.local> }
 *   Resolve `key` e seus ALIASES. Prioridade de FONTE:
 *     1) .env.local (qualquer alias)  2) process.env (fallback, qualquer alias).
 *   Se `required` e ausente em todas as fontes/aliases, lanca Error listando
 *   as chaves tentadas. Se nao `required`, retorna undefined.
 *
 * Tabela de aliases (derivada dos parses reais em scripts/):
 *   SUPABASE_SECRET_KEY  <-> SUPABASE_SERVICE_ROLE_KEY   (rename Supabase 2025)
 *   GEMINI_API_KEY       <-> GOOGLE_API_KEY
 *
 * Uso real:   const url = getEnvLocal('SUPABASE_URL', { required: true });
 * Uso teste:  getEnvLocal('SUPABASE_SECRET_KEY', { envMap: {SUPABASE_SERVICE_ROLE_KEY:'x'} })
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export const ENV_ALIASES = {
    SUPABASE_SECRET_KEY: ['SUPABASE_SERVICE_ROLE_KEY'],
    SUPABASE_SERVICE_ROLE_KEY: ['SUPABASE_SECRET_KEY'],
    GEMINI_API_KEY: ['GOOGLE_API_KEY'],
    GOOGLE_API_KEY: ['GEMINI_API_KEY'],
};

export function parseEnvContent(text) {
    const out = {};
    if (typeof text !== 'string') return out;
    for (const raw of text.split(/\r?\n/)) {
        let line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        if (line.startsWith('export ')) line = line.slice('export '.length).trim();
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key) continue;
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        out[key] = val;
    }
    return out;
}

function _readEnvLocal(envPath) {
    const p = envPath || path.join(ROOT, '.env.local');
    try {
        return parseEnvContent(fs.readFileSync(p, 'utf8'));
    } catch {
        return {};
    }
}

export function getEnvLocal(key, opts = {}) {
    const { required = false, envMap, processEnv = process.env } = opts;
    const map = envMap || _readEnvLocal(opts.envPath);
    const candidates = [key, ...(ENV_ALIASES[key] || [])];
    for (const k of candidates) {
        if (map[k]) return map[k];
    }
    for (const k of candidates) {
        if (processEnv && processEnv[k]) return processEnv[k];
    }
    if (required) {
        throw new Error(
            `[env] variavel obrigatoria ausente; tentadas (em ordem): ${candidates.join(' / ')} — fontes: .env.local, process.env`,
        );
    }
    return undefined;
}
