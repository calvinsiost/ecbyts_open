// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MODO SIMPLES/TÉCNICO — camada leiga global (FRIEND-SCORE-001 TD-11)
   Conceito trazido da Fundação ecbyts (ecbyts_robots): a mesma tela
   fala "leigo" por padrão (modo Simples) e "técnico" sob demanda.

   Resolve TD-11 (learnability): "jargão sem tooltip fora dos HUDs".
   Pure-logic: normaliza o modo + carrega o GLOSSÁRIO leigo (jargão →
   explicação em linguagem comum, pt/en/es). NÃO toca DOM/storage aqui
   (isso é o languageModeManager). Fail-safe: termo/idioma ausente →
   null (o caller degrada graciosamente, nunca inventa explicação).
   ================================================================ */

export type LayMode = 'lay' | 'tech';
export type LayLocale = 'pt' | 'en' | 'es';

/** Modo padrão = Simples (leigo). Calvin não é programador; o leigo vem primeiro. */
export const DEFAULT_LAY_MODE: LayMode = 'lay';

/** Classe aplicada em <html> por modo (espelha o padrão .fx-lay/.fx-tech da Fundação). */
export const LAY_MODE_CLASS: Readonly<Record<LayMode, string>> = Object.freeze({
    lay: 'ecbt-lay',
    tech: 'ecbt-tech',
});

/** Chave de persistência (localStorage). */
export const LAY_MODE_STORAGE_KEY = 'ecbyts-lay-mode';

/** Evento disparado quando o modo muda (consumidores re-renderizam se quiserem). */
export const LAY_MODE_EVENT = 'ecbyts:lay-mode-change';

export function normalizeLayMode(raw: unknown): LayMode {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'tech' || s === 'tecnico' || s === 'técnico' || s === 'technical' || s === 'expert') {
        return 'tech';
    }
    // qualquer outra coisa (inclusive vazio/desconhecido) → Simples (fail-safe leigo)
    return 'lay';
}

export function toggleLayMode(current: unknown): LayMode {
    return normalizeLayMode(current) === 'lay' ? 'tech' : 'lay';
}

export function resolveModeClass(mode: unknown): string {
    return LAY_MODE_CLASS[normalizeLayMode(mode)];
}

/** Normaliza o locale do app (pt-BR/en-US/es-LA…) para a chave do glossário. */
export function normalizeLayLocale(raw: unknown): LayLocale {
    const s = String(raw ?? '').trim().toLowerCase();
    if (s.startsWith('en')) return 'en';
    if (s.startsWith('es')) return 'es';
    return 'pt';
}

export interface LayTerm {
    /** Rótulo curto canônico do termo (como aparece na UI). */
    readonly term: string;
    /** Explicação leiga (1 frase), por idioma. */
    readonly pt: string;
    readonly en: string;
    readonly es: string;
}

/* GLOSSÁRIO LEIGO — jargão ambiental/da plataforma → 1 frase em linguagem comum.
   Fonte dos termos: glossário do CLAUDE.md + dores de jargão (TD-11). Mantido enxuto
   e autocontido (não depende de translations.ts). Chave = slug estável minúsculo. */
export const LAY_GLOSSARY: Readonly<Record<string, LayTerm>> = Object.freeze({
    eis: Object.freeze({
        term: 'EIS',
        pt: 'Nota de integridade ambiental do local (0 a 100): quanto maior, mais confiável e saudável a situação.',
        en: 'Site environmental integrity score (0–100): higher means more trustworthy and healthier.',
        es: 'Nota de integridad ambiental del sitio (0 a 100): cuanto mayor, más confiable y saludable.',
    }),
    'ecbt-score': Object.freeze({
        term: 'ECBT Score',
        pt: 'Resultado financeiro líquido do local em dinheiro: o que ele vale menos o que custa resolver (verde = positivo).',
        en: 'Net financial result of the site in money: what it is worth minus the cost to fix it (green = positive).',
        es: 'Resultado financiero neto del sitio en dinero: lo que vale menos lo que cuesta resolverlo (verde = positivo).',
    }),
    conama: Object.freeze({
        term: 'CONAMA',
        pt: 'Conselho federal que define os limites ambientais oficiais do Brasil.',
        en: 'Brazilian federal council that sets the official environmental limits.',
        es: 'Consejo federal brasileño que define los límites ambientales oficiales.',
    }),
    cetesb: Object.freeze({
        term: 'CETESB',
        pt: 'Órgão ambiental de São Paulo; define os valores de referência de limpeza usados aqui.',
        en: 'São Paulo environmental agency; sets the reference cleanup values used here.',
        es: 'Agencia ambiental de São Paulo; define los valores de referencia de limpieza.',
    }),
    vr: Object.freeze({
        term: 'VR',
        pt: 'Valor de Referência: o quanto da substância já existe naturalmente no solo limpo.',
        en: 'Reference Value: how much of the substance is naturally present in clean soil.',
        es: 'Valor de Referencia: cuánto de la sustancia existe naturalmente en suelo limpio.',
    }),
    vp: Object.freeze({
        term: 'VP',
        pt: 'Valor de Prevenção: acima dele, é preciso ficar de olho e monitorar.',
        en: 'Prevention Value: above it, monitoring is required.',
        es: 'Valor de Prevención: por encima, es necesario monitorear.',
    }),
    vi: Object.freeze({
        term: 'VI',
        pt: 'Valor de Intervenção: acima dele, há risco e a área precisa ser limpa.',
        en: 'Intervention Value: above it, there is risk and the area must be cleaned.',
        es: 'Valor de Intervención: por encima, hay riesgo y el área debe limpiarse.',
    }),
    cma: Object.freeze({
        term: 'CMA',
        pt: 'Meta de limpeza calculada para o local pelo estudo de risco (até onde é seguro chegar).',
        en: 'Cleanup target computed for the site by the risk study (how clean is safe enough).',
        es: 'Meta de limpieza calculada para el sitio por el estudio de riesgo.',
    }),
    pluma: Object.freeze({
        term: 'pluma',
        pt: 'Mancha 3D de contaminação que se espalha pela água subterrânea ou pelo solo.',
        en: '3D plume of contamination spreading through groundwater or soil.',
        es: 'Mancha 3D de contaminación que se extiende por el agua subterránea o el suelo.',
    }),
    poco: Object.freeze({
        term: 'poço de monitoramento',
        pt: 'Furo vertical onde se coleta água para medir a contaminação.',
        en: 'Vertical borehole where water is sampled to measure contamination.',
        es: 'Perforación vertical donde se toma agua para medir la contaminación.',
    }),
    campanha: Object.freeze({
        term: 'campanha',
        pt: 'Uma ida a campo para coletar amostras numa data (equipe + medições).',
        en: 'A field sampling event on a date (team + measurements).',
        es: 'Una salida de campo para tomar muestras en una fecha (equipo + mediciones).',
    }),
    merkle: Object.freeze({
        term: 'Merkle',
        pt: 'Selo digital que prova que os dados não foram adulterados (como um lacre).',
        en: 'Digital seal proving the data was not tampered with (like a tamper seal).',
        es: 'Sello digital que prueba que los datos no fueron alterados (como un precinto).',
    }),
    conformidade: Object.freeze({
        term: 'conformidade',
        pt: 'Se o local está dentro das regras ambientais oficiais (ou quantas violações tem).',
        en: 'Whether the site is within the official environmental rules (or how many violations).',
        es: 'Si el sitio está dentro de las reglas ambientales oficiales (o cuántas violaciones).',
    }),
    incerteza: Object.freeze({
        term: 'incerteza',
        pt: 'A margem de erro do número: o quanto ele pode variar para mais ou para menos.',
        en: 'The margin of error of a number: how much it may vary up or down.',
        es: 'El margen de error del número: cuánto puede variar hacia arriba o abajo.',
    }),
});

/** Explicação leiga de um termo no idioma pedido; null se termo/idioma ausente. */
export function getLayExplanation(termKey: unknown, locale: unknown): string | null {
    const key = String(termKey ?? '').trim().toLowerCase();
    const entry = LAY_GLOSSARY[key];
    if (!entry) return null;
    const loc = normalizeLayLocale(locale);
    return entry[loc] || entry.pt || null;
}

/** Lista os slugs do glossário (para varredura/decoração e testes). */
export function layGlossaryKeys(): ReadonlyArray<string> {
    return Object.freeze(Object.keys(LAY_GLOSSARY));
}
