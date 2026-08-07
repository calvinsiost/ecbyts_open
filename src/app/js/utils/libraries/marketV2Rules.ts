// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/utils/libraries/marketV2Rules.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/utils/libraries/marketV2Rules.ts';
let __warned = false;
function __warnOnce() {
    if (__warned) return;
    __warned = true;
    try { console.warn('[guest-stub] ' + __stubModule + ': feature desligada no Modo Convidado'); } catch { /* noop */ }
}
function __makeStub(name: string): any {
    const fn = function () { __warnOnce(); return undefined; };
    const stub = new Proxy(fn, {
        get(target, prop) {
            // Thenable-safe SEM deadlock (achado da F5): stub.then(cb) chama
            // cb(undefined) e `await stub` resolve undefined. Sem isto, o
            // `undefined.then()` no topo de main.ts derruba o boot ANTES do banner.
            if (prop === 'then') return function (onF: any) {
                try { if (typeof onF === 'function') onF(undefined); } catch { /* noop */ }
                return stub;
            };
            if (prop === 'catch' || prop === 'finally') return function () { return stub; };
            // for..of / spread não quebram: iterador vazio.
            if (prop === Symbol.iterator) return function () { return { next: function () { return { value: undefined, done: true }; } }; };
            if (prop === Symbol.toPrimitive) return function () { return undefined; };
            // evita recursão infinita em JSON.stringify(stub).
            if (prop === 'toJSON') return function () { return undefined; };
            if (prop in target) return Reflect.get(target, prop);
            return __makeStub(name + '.' + String(prop));
        },
        construct() { __warnOnce(); return {}; },
        // apply devolve o PRÓPRIO stub (não undefined) p/ encadear x().y() e x().then().
        apply() { __warnOnce(); return stub; },
    });
    return stub;
}
export const canTransition: any = __makeStub('canTransition');
export const validateInstitutionSplit: any = __makeStub('validateInstitutionSplit');
export const calculateSplit: any = __makeStub('calculateSplit');
export const validateCreditSplit: any = __makeStub('validateCreditSplit');
export const calculateCreditSplit: any = __makeStub('calculateCreditSplit');
export const classifyEicQuality: any = __makeStub('classifyEicQuality');
export const applyReputationDecay: any = __makeStub('applyReputationDecay');
export const computeReputationScore: any = __makeStub('computeReputationScore');
export const validatePayloadLimits: any = __makeStub('validatePayloadLimits');
export const validateFileSpec: any = __makeStub('validateFileSpec');
export const marketPublicRatingVolumeBand: any = __makeStub('marketPublicRatingVolumeBand');
export const canDisplayPublicRating: any = __makeStub('canDisplayPublicRating');
export const encodeCursor: any = __makeStub('encodeCursor');
export const decodeCursor: any = __makeStub('decodeCursor');
export const MARKET_STATE_MACHINES: any = __makeStub('MARKET_STATE_MACHINES');
