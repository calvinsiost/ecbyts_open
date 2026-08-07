// _leakScanPure.mjs — ECBYTS-OPEN-LOCAL-001 F2 (§2.5)
// ============================================================================
// Lógica PURA do leak-scan bloqueante. Nenhum I/O aqui — o runtime vive em
// leak-scan.mjs (standalone) e em extract-to-open.mjs (gate pré-escrita).
//
// A LISTA CANÔNICA de padrões é ESTE arquivo (specs não substituem código).
//
// NOTA de implementação: os padrões-gatilho são construídos por CONCATENAÇÃO
// para que este próprio arquivo (publicável no ecbyts_open, §4.1) não
// contenha as strings literais e não dispare o próprio scanner.
// ============================================================================

const SK = 'sk_';
const PK = 'pk_';
const SB = 'sb';
const JWT_HEAD = 'eyJhbGci' + 'Oi';

/** Extensões de texto que o scanner lê; o resto só passa por regras de nome. */
export const TEXT_EXTENSIONS = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.mts', '.d.ts', '.json', '.html', '.htm',
    '.css', '.md', '.txt', '.yml', '.yaml', '.cff', '.svg', '.xml', '.csv',
    '.env', '.sql', '.sh', '.ps1', '.py', '.toml', '.ini', '.htaccess',
]);

/** Diretórios nunca varridos pelo runtime. */
export const SKIP_DIRS = new Set(['.git', 'node_modules', '.runtime']);

/** Arquivos onde emails são legítimos (§2.5). */
const EMAIL_EXEMPT_FILES = /(^|\/)(LICENSE([._-][\w.]+)?|CODE_OF_CONDUCT(\.\w+)?)$/i;

/** Domínios de email placeholder que não são PII/segredo. */
const EMAIL_PLACEHOLDER_DOMAIN =
    /(^|\.)(example\.(com|org|net)|placeholder\.[a-z]+|test|invalid|local|localhost)$/i;

/** Falsos positivos de email: `logo@2x.png`, specifiers `pkg@1.2.3`, etc. */
const EMAIL_ASSET_DOMAIN = /\.(png|jpe?g|svg|webp|gif|css|js|mjs|ts|json|html|md|woff2?)$/i;

/**
 * Padrões de vazamento (§2.5). Cada um: { id, description, regex, filter? }.
 * `filter(match, relPath)` pode descartar falso positivo; default = mantém.
 */
export const LEAK_PATTERNS = [
    // Chaves: exigem corpo >= 8 chars após o prefixo — o prefixo sozinho
    // (padrões de DETECÇÃO em módulos auditores, comentários) não é uma chave.
    {
        id: 'stripe-secret-live',
        description: 'chave secreta Stripe live',
        regex: new RegExp(SK + 'live_[A-Za-z0-9]{8,}', 'g'),
    },
    {
        id: 'stripe-secret-test',
        description: 'chave secreta Stripe test',
        regex: new RegExp(SK + 'test_[A-Za-z0-9]{8,}', 'g'),
    },
    {
        id: 'stripe-publishable-live',
        description: 'chave publishable Stripe live',
        regex: new RegExp(PK + 'live_[A-Za-z0-9]{8,}', 'g'),
    },
    {
        id: 'supabase-pat',
        description: 'personal access token Supabase',
        regex: new RegExp(SB + 'p_[A-Za-z0-9]{8,}', 'g'),
    },
    {
        id: 'supabase-secret',
        description: 'secret key Supabase',
        regex: new RegExp(SB + '_secret_[A-Za-z0-9_-]{8,}', 'g'),
    },
    {
        // Forma completa header.payload.signature — o header literal sozinho
        // (ex.: template de token preview) não é um token vazado.
        id: 'jwt',
        description: 'JWT completo (header.payload.signature)',
        regex: new RegExp(JWT_HEAD + '[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+', 'g'),
    },
    {
        id: 'supabase-url',
        description: 'URL de projeto Supabase real (não-placeholder)',
        regex: new RegExp('https?://([a-z0-9-]+)\\.' + 'supabase\\.co', 'g'),
        filter: (m) => !/\/\/(placeholder|your-project)[.-]/.test(m[0]),
    },
    {
        id: 'email',
        description: 'endereço de email fora de LICENSE/CODE_OF_CONDUCT',
        regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
        filter: (m, relPath) => {
            if (EMAIL_EXEMPT_FILES.test(relPath)) return false;
            // libs vendored (three.js, chart.js, …): emails de autores upstream
            // já são públicos no pacote original — não são vazamento nosso.
            if (relPath.startsWith('app/lib/')) return false;
            const domain = m[0].split('@')[1] || '';
            // Emails institucionais no domínio canônico do produto (privacy@,
            // support@, founder@, … — ver contactRegistry.CANONICAL_DOMAIN):
            // contato público intencional exibido na própria UI, não PII.
            // Decisão claude-adm 2026-08-05, registrada na spec §2.5.
            if (domain.toLowerCase() === 'ecbyts.com') return false;
            if (EMAIL_PLACEHOLDER_DOMAIN.test(domain)) return false;
            if (EMAIL_ASSET_DOMAIN.test(domain)) return false;
            // specifier npm `pkg@1.2.3` / `pkg@v1.0.0` — versão não é email
            if (/^v?[\d.]+$/.test(domain)) return false;
            return true;
        },
    },
    // EXCEÇÃO DE CONTEÚDO gac-dd38 (decisão Calvin 2026-08-05): a regra de
    // CONTEÚDO foi removida. Motivo apurado: o codinome nomeia o preset
    // "GAC-DD38 (CETESB DD 038/2017)" — um fluxo de pipeline ambiental de
    // EXEMPLO/TREINO baseado numa NORMA PÚBLICA da CETESB, embutido como material
    // de aula/LMS/onboarding (core/pipelines/gacDd38PipelinePreset.ts + módulos
    // de treino). Não é segredo nem cliente confidencial — é conteúdo educacional
    // que AJUDA o objetivo do Modo Convidado ("ver o ecbyts funcionando com um
    // fluxo real"). As 92 menções eram só esse codinome em código publicável.
    // O que CONTINUA barrado: o ARQUIVO de evidência de auditoria
    // (gac-dd38-*.html, ~3.8 MB) segue excluído pela FILENAME_RULE abaixo — só
    // o codinome em código-fonte foi liberado, não o artefato interno grande.
    {
        id: 'windows-user-path',
        description: 'caminho local de usuário Windows',
        regex: new RegExp('[A-Za-z]:[\\\\/]+' + 'Users[\\\\/]', 'g'),
    },
];

/** Regras por NOME de arquivo (aplicam mesmo a binários). */
export const FILENAME_RULES = [
    {
        id: 'analysis-draft-json',
        description: 'artefato interno *.analysis.draft.json',
        test: (relPath) => relPath.endsWith('.analysis.draft.json'),
    },
    {
        id: 'gac-' + 'dd38-filename',
        description: 'arquivo de evidência gac-' + 'dd38*',
        test: (relPath) => (relPath.split('/').pop() || '').startsWith('gac-' + 'dd38'),
    },
];

/** Redige o trecho do match para o relatório (não re-vaza o segredo). */
export function redactMatch(text) {
    const s = String(text);
    return s.length <= 16 ? s : s.slice(0, 12) + '…(' + s.length + ' chars)';
}

function lineOfIndex(content, index) {
    let line = 1;
    for (let i = 0; i < index && i < content.length; i++) {
        if (content[i] === '\n') line++;
    }
    return line;
}

/**
 * Varre o CONTEÚDO de um arquivo por todos os padrões.
 * @param {string} relPath — path relativo ao target (POSIX)
 * @param {string} content
 * @returns {{pattern:string, description:string, file:string, line:number, excerpt:string}[]}
 */
export function scanContent(relPath, content) {
    const findings = [];
    const p = String(relPath).replace(/\\/g, '/');
    for (const pat of LEAK_PATTERNS) {
        pat.regex.lastIndex = 0;
        let m;
        while ((m = pat.regex.exec(content)) !== null) {
            if (pat.filter && !pat.filter(m, p)) continue;
            findings.push({
                pattern: pat.id,
                description: pat.description,
                file: p,
                line: lineOfIndex(content, m.index),
                excerpt: redactMatch(m[0]),
            });
            if (m.index === pat.regex.lastIndex) pat.regex.lastIndex++;
        }
    }
    return findings;
}

/**
 * Aplica as regras de NOME a um path.
 * @returns {{pattern:string, description:string, file:string, line:number, excerpt:string}[]}
 */
export function scanFilename(relPath) {
    const p = String(relPath).replace(/\\/g, '/');
    const findings = [];
    for (const rule of FILENAME_RULES) {
        if (rule.test(p)) {
            findings.push({
                pattern: rule.id,
                description: rule.description,
                file: p,
                line: 0,
                excerpt: p.split('/').pop() || p,
            });
        }
    }
    return findings;
}

/**
 * Varre um conjunto de arquivos em memória (gate pré-escrita do extract).
 * @param {{path:string, content:string|null}[]} files — content null = binário
 */
export function scanFileSet(files) {
    const findings = [];
    for (const f of files) {
        findings.push(...scanFilename(f.path));
        if (typeof f.content === 'string') findings.push(...scanContent(f.path, f.content));
    }
    return findings;
}

/** O runtime deve ler o conteúdo deste arquivo? */
export function isTextFile(relPath) {
    const p = String(relPath).toLowerCase();
    if (p.endsWith('.d.ts')) return true;
    const dot = p.lastIndexOf('.');
    if (dot === -1) return /(^|\/)(license|readme|\.htaccess|\.nvmrc|\.gitignore|\.env[^/]*)$/.test(p);
    return TEXT_EXTENSIONS.has(p.slice(dot));
}

/** Formata o relatório humano (pt-BR) do scan. */
export function formatReport(findings, scannedCount) {
    const lines = [];
    if (!findings.length) {
        lines.push(`leak-scan: 0 matches em ${scannedCount} arquivos — OK.`);
        return lines.join('\n');
    }
    lines.push(`leak-scan: ${findings.length} match(es) em ${scannedCount} arquivos — BLOQUEADO.`);
    const byPattern = new Map();
    for (const f of findings) {
        if (!byPattern.has(f.pattern)) byPattern.set(f.pattern, []);
        byPattern.get(f.pattern).push(f);
    }
    for (const [pattern, list] of byPattern) {
        lines.push(`  [${pattern}] ${list[0].description} — ${list.length} ocorrência(s):`);
        for (const f of list.slice(0, 20)) {
            lines.push(`    ${f.file}:${f.line} → ${f.excerpt}`);
        }
        if (list.length > 20) lines.push(`    … +${list.length - 20}`);
    }
    return lines.join('\n');
}
