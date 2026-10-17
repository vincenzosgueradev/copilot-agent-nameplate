/**
 * Il codice del tool gira nel browser e usa `DOMParser` globale. Nei test in Node serve un
 * parser XML: `@xmldom/xmldom`, lo stesso che usano gli smoke script. Nei test con jsdom il
 * `DOMParser` esiste gia' e non lo si tocca.
 */
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

if (typeof (globalThis as { DOMParser?: unknown }).DOMParser === 'undefined') {
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;
}

/**
 * In jsdom il `Uint8Array` globale e quello restituito da `TextEncoder` sono di "mondi" diversi
 * (realm): `fflate` controlla `instanceof Uint8Array`, quindi scambia i file per cartelle e produce
 * zip sbagliati (le chiavi escono con una `/` finale). Nel browser vero il mondo e' uno solo, quindi
 * non e' un difetto dell'app: qui si porta il test nelle stesse condizioni. Va fatto PRIMA che
 * `fflate` venga importato, e per questo sta nello setup.
 */
const NodeUint8Array = new TextEncoder().encode('').constructor as Uint8ArrayConstructor;
if (globalThis.Uint8Array !== NodeUint8Array) {
    (globalThis as unknown as { Uint8Array: Uint8ArrayConstructor }).Uint8Array = NodeUint8Array;
}
