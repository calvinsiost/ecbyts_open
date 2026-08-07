export interface EditalDocument {
    name: string;
    required: boolean;
    status: 'OK' | 'PENDENTE' | 'NAO_APLICAVEL';
    path: string;
}

export interface SateliteCanonico {
    id: string;
    nome: string;
    leadTimeDias: number;
    condicaoAplicavel: string | null;
    obrigatorio: boolean;
}

export interface Gap {
    documento: string;
    prazoLimite: string;
    vencido: boolean;
    motivo: string;
}

export const CANONICAL_DOCS: SateliteCanonico[] = [
    {
        id: 'anuencia-institucional',
        nome: 'Anuências institucionais',
        leadTimeDias: 30,
        condicaoAplicavel: null,
        obrigatorio: true,
    },
    {
        id: 'comite-etica-cep',
        nome: 'Comitê de ética / CEP',
        leadTimeDias: 60,
        condicaoAplicavel: 'pesquisa com seres humanos',
        obrigatorio: false,
    },
    {
        id: 'consentimento-previo',
        nome: 'Consentimento Prévio e Informado',
        leadTimeDias: 45,
        condicaoAplicavel: 'povos e comunidades tradicionais',
        obrigatorio: false,
    },
    {
        id: 'sumula-curricular',
        nome: 'Súmulas curriculares',
        leadTimeDias: 15,
        condicaoAplicavel: null,
        obrigatorio: true,
    },
    {
        id: 'plano-gestao-dados',
        nome: 'Plano de Gestão de Dados',
        leadTimeDias: 20,
        condicaoAplicavel: null,
        obrigatorio: true,
    },
    {
        id: 'cadastro-sage',
        nome: 'Cadastro SAGe',
        leadTimeDias: 10,
        condicaoAplicavel: 'submissão via agência de fomento',
        obrigatorio: false,
    },
    {
        id: 'cadastro-sigconfap',
        nome: 'Cadastro SIGCONFAP',
        leadTimeDias: 10,
        condicaoAplicavel: null,
        obrigatorio: true,
    },
    {
        id: 'carta-contrapartida',
        nome: 'Cartas de contrapartida',
        leadTimeDias: 25,
        condicaoAplicavel: 'contrapartida de FAP ou parceiro',
        obrigatorio: false,
    },
    {
        id: 'cv-lattes',
        nome: 'CVs / Lattes atualizados',
        leadTimeDias: 7,
        condicaoAplicavel: null,
        obrigatorio: true,
    },
    {
        id: 'declaracao-vinculo',
        nome: 'Declarações de vínculo',
        leadTimeDias: 15,
        condicaoAplicavel: null,
        obrigatorio: true,
    },
];

function subtrairDias(isoDate: string, dias: number): string {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - dias);
    return d.toISOString().slice(0, 10);
}

export function calcularGaps(
    editalId: string,
    existingDocs: EditalDocument[],
    deadline: string,
    hoje?: Date,
): Gap[] {
    if (!editalId || typeof editalId !== 'string') {
        throw new Error('calcularGaps: editalId deve ser string não-vazia');
    }
    if (!deadline || typeof deadline !== 'string') {
        throw new Error('calcularGaps: deadline deve ser string ISO (YYYY-MM-DD)');
    }
    if (!Array.isArray(existingDocs)) {
        throw new Error('calcularGaps: existingDocs deve ser array');
    }

    const hojeDate = hoje ?? new Date();
    const hojeStr = hojeDate.toISOString().slice(0, 10);

    const existingByName = new Map<string, EditalDocument>();
    for (const doc of existingDocs) {
        existingByName.set(doc.name.toLowerCase().trim(), doc);
    }

    const gaps: Gap[] = [];

    for (const canonico of CANONICAL_DOCS) {
        const existing = existingByName.get(canonico.nome.toLowerCase().trim());

        if (existing && existing.status === 'OK') continue;
        if (existing && existing.status === 'NAO_APLICAVEL') continue;

        const prazoLimite = subtrairDias(deadline, canonico.leadTimeDias);
        const vencido = prazoLimite < hojeStr;

        let motivo: string;
        if (!existing) {
            motivo = canonico.condicaoAplicavel
                ? `Documento ausente (aplicável se: ${canonico.condicaoAplicavel})`
                : 'Documento ausente';
        } else if (existing.status === 'PENDENTE') {
            motivo = canonico.condicaoAplicavel
                ? `Documento pendente (aplicável se: ${canonico.condicaoAplicavel})`
                : 'Documento pendente';
        } else {
            continue;
        }

        gaps.push({
            documento: canonico.nome,
            prazoLimite,
            vencido,
            motivo,
        });
    }

    gaps.sort((a, b) => {
        if (a.vencido !== b.vencido) return a.vencido ? -1 : 1;
        return a.prazoLimite.localeCompare(b.prazoLimite);
    });

    return gaps;
}
