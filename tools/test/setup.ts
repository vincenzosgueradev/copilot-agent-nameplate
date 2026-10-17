/**
 * Il codice del tool gira nel browser e usa `DOMParser` globale. Nei test in Node serve un
 * parser XML: `@xmldom/xmldom`, lo stesso che usano gli smoke script. Nei test con jsdom il
 * `DOMParser` esiste gia' e non lo si tocca.
 */
import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

if (typeof (globalThis as { DOMParser?: unknown }).DOMParser === 'undefined') {
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = XmlDomParser;
}
