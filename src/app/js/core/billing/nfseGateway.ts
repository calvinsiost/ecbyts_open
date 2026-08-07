// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/core/billing/nfseGateway.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/core/billing/nfseGateway.ts';
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
export const composePayloadABRASF: any = __makeStub('composePayloadABRASF');
export const composePayloadNacional: any = __makeStub('composePayloadNacional');
export const chooseLayoutByEmitterRegime: any = __makeStub('chooseLayoutByEmitterRegime');
export const validateCnpj: any = __makeStub('validateCnpj');
export const validateCpf: any = __makeStub('validateCpf');
export const validateCnpjOrCpf: any = __makeStub('validateCnpjOrCpf');
export const computeIdempotencyKey: any = __makeStub('computeIdempotencyKey');
export const composeIdempotencyKey: any = __makeStub('composeIdempotencyKey');
export const deriveReissueIdempotencyKey: any = __makeStub('deriveReissueIdempotencyKey');
export const classifyNFSeError: any = __makeStub('classifyNFSeError');
export const canTransition: any = __makeStub('canTransition');
export const applyTransition: any = __makeStub('applyTransition');
export const isTerminalStatus: any = __makeStub('isTerminalStatus');
export const isSuccessStatus: any = __makeStub('isSuccessStatus');
export type NFSeStatus = any;
export type NFSeProvider = any;
export type NFSeLayout = any;
export type EmitterRegime = any;
export type NFSeErrorTier = any;
export type NFSeEmitter = any;
export type NFSeReceiver = any;
export type NFSeTransaction = any;
export type NFSePayload = any;
export type NFSeResult = any;
export type NFSeErrorClassification = any;
export type IdempotencyKeyFields = any;
