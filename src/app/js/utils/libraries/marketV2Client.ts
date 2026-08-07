// AUTO-GENERATED GUEST-MODE STUB — ECBYTS-OPEN-LOCAL-001 §2.4. DO NOT EDIT.
// O módulo original 'src/app/js/utils/libraries/marketV2Client.ts' NÃO é publicado (fora da allowlist).
// Mesma superfície de exports; comportamento: feature desligada no Modo Convidado.
const __stubModule = 'src/app/js/utils/libraries/marketV2Client.ts';
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
export const marketAuthUserId: any = __makeStub('marketAuthUserId');
export const createListingDraft: any = __makeStub('createListingDraft');
export const patchListingDraft: any = __makeStub('patchListingDraft');
export const recordListingConsent: any = __makeStub('recordListingConsent');
export const publishListing: any = __makeStub('publishListing');
export const createListingVersion: any = __makeStub('createListingVersion');
export const publishListingVersion: any = __makeStub('publishListingVersion');
export const searchListings: any = __makeStub('searchListings');
export const searchCredits: any = __makeStub('searchCredits');
export const fetchCreditPortfolio: any = __makeStub('fetchCreditPortfolio');
export const fetchCreditById: any = __makeStub('fetchCreditById');
export const generateCredits: any = __makeStub('generateCredits');
export const retireCredits: any = __makeStub('retireCredits');
export const markCreditListed: any = __makeStub('markCreditListed');
export const buyListing: any = __makeStub('buyListing');
export const createRfqThread: any = __makeStub('createRfqThread');
export const addRfqProposal: any = __makeStub('addRfqProposal');
export const acceptRfqProposal: any = __makeStub('acceptRfqProposal');
export const deliverOrder: any = __makeStub('deliverOrder');
export const acceptOrderDelivery: any = __makeStub('acceptOrderDelivery');
export const openOrderDispute: any = __makeStub('openOrderDispute');
export const submitOrderReview: any = __makeStub('submitOrderReview');
export const addDisputeMessage: any = __makeStub('addDisputeMessage');
export const fetchPublicRating: any = __makeStub('fetchPublicRating');
export const fetchNotifications: any = __makeStub('fetchNotifications');
export const markNotificationRead: any = __makeStub('markNotificationRead');
export const fetchMarketDashboard: any = __makeStub('fetchMarketDashboard');
export const fetchAdminModerationQueue: any = __makeStub('fetchAdminModerationQueue');
export const moderateListing: any = __makeStub('moderateListing');
export const fetchAdminDisputesQueue: any = __makeStub('fetchAdminDisputesQueue');
export const resolveDispute: any = __makeStub('resolveDispute');
export const fetchWebhookDlq: any = __makeStub('fetchWebhookDlq');
export const replayWebhook: any = __makeStub('replayWebhook');
export const renewListing: any = __makeStub('renewListing');
export const markDeliveryDownload: any = __makeStub('markDeliveryDownload');
export const fetchInstitutions: any = __makeStub('fetchInstitutions');
export const suggestInstitution: any = __makeStub('suggestInstitution');
export const setListingAccess: any = __makeStub('setListingAccess');
