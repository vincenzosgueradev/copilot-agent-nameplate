/**
 * Il campo `icon` di package.json e' un percorso relativo alla cartella `dist` (documentazione PPTB,
 * "Publishing Tools"). Con `dist/logo.svg` il marketplace cerca `dist/dist/logo.svg`, non trova nulla
 * e mostra l'icona di riserva (la scatola): successo con 1.1.2 e 1.1.3. Oracolo: la pagina del
 * marketplace con la scatola al posto del logo. Vite copia `src/public/` nella radice di `dist/`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { icon?: string };

describe('icona del tool nel marketplace', () => {
    it('`icon` e` un SVG', () => {
        expect(pkg.icon).toMatch(/\.svg$/);
    });
    it('`icon` e` relativo alla radice di dist, non al pacchetto: non comincia con "dist/"', () => {
        expect(pkg.icon).not.toMatch(/^\.?\/?dist\//);
    });
    it('il file indicato da `icon` finisce nella radice di dist (esiste in src/public)', () => {
        expect(existsSync(resolve(root, 'src/public', pkg.icon ?? 'manca'))).toBe(true);
    });
    it('dopo la build il file e` dove `icon` lo cerca, se dist esiste', () => {
        const dist = resolve(root, 'dist');
        if (!existsSync(dist)) return;
        expect(existsSync(resolve(dist, pkg.icon ?? 'manca'))).toBe(true);
    });
});

describe('icona a un solo colore (PPTB-PUBLISHING-RULES, sezione 4)', () => {
    const svg = readFileSync(resolve(root, 'src/public', pkg.icon ?? 'manca'), 'utf8');
    it('usa currentColor', () => {
        expect(svg).toContain('currentColor');
    });
    it('non ha colori fissi', () => {
        expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(svg).not.toMatch(/(fill|stroke)="(?!none|currentColor)[a-zA-Z]+"/);
    });
    it('non ha sfumature ne` una tile di sfondo', () => {
        expect(svg).not.toMatch(/Gradient/i);
        expect(svg).not.toMatch(/<rect[^>]*fill="(?!none)/);
    });
    it('il logo a colori dell\'app e` un altro file, usato nell\'intestazione', () => {
        expect(existsSync(resolve(root, 'src/public/logo-color.svg'))).toBe(true);
        expect(readFileSync(resolve(root, 'src/index.html'), 'utf8')).toContain('src="./logo-color.svg"');
    });
});

describe('README come pagina del marketplace (sezione 3)', () => {
    const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
    it('ogni link e immagine e` un URL completo', () => {
        const relative = [...readme.matchAll(/\]\(([^)]*)\)/g)].map(m => m[1]!)
            .filter(u => !u.startsWith('https://') && !u.startsWith('#'));
        expect(relative).toEqual([]);
    });
    it('non contiene HTML grezzo', () => {
        expect(readme).not.toMatch(/<(img|a|div|br|p|span|table)[\s>]/i);
    });
});
