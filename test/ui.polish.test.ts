// @vitest-environment jsdom
/**
 * Spec 018 (blocchi B e C) — i popup hanno l'icona e righe con icona; la pipeline di export e' numerata
 * e il passo in corso si vede. Oracolo scritto dalla spec (FR-004…FR-008).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, type UiWorld } from './helpers/ui-harness';
import { readSource } from './helpers/source';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const WORLD: UiWorld = {
    solutions: [{ unique: 'S1' }],
    agents: [
        { name: 'agent1 [DEV]', schema: 'ava_a1', solution: 'S1', publish: null },
        { name: 'agent2 [DEV]', schema: 'ava_a2', solution: 'S1', publish: null },
    ],
};

const css = readSource('styles.css');
const rule = (re: RegExp) => re.exec(css)?.[1] ?? '';

async function toBuild(targets: string[], raise = true) {
    const ui = await boot(WORLD);
    await ui.openSolution('S1');
    await ui.startRenameBare();
    for (const t of targets) await ui.tickTarget(t, true);
    await ui.setRaise(raise);
    await ui.next();
    return ui;
}

const overlay = (ui: { doc: Document }) => ui.doc.getElementById('confirm-overlay')!;

describe('popup: l\'icona nell\'intestazione (FR-004)', () => {
    it('ogni nome di icona ha la sua forma in styles.css', () => {
        const names = [...readSource('icons.ts').matchAll(/^\s+\| '([a-z-]+)'/gm)].map(m => m[1]!);
        expect(names.length).toBeGreaterThan(30);
        for (const n of names) expect(css.includes(`.icon-${n} {`), `.icon-${n}`).toBe(true);
    });
    it('la pagina ha il posto per l\'icona del popup', () => {
        expect(readSource('index.html')).toMatch(/id="confirm-icon"\s+class="dialog-icon"/);
    });
    it('il cerchio dell\'intestazione ha i due colori: blu e avviso', () => {
        expect(rule(/\.dialog-icon\s*\{([^}]*)\}/)).toMatch(/border-radius:\s*50%/);
        expect(rule(/\.dialog--warning \.dialog-icon\s*\{([^}]*)\}/)).toMatch(/--color-warning/);
    });
    it('il vecchio cerchio con «!» in CSS non c\'e\' piu\'', () => {
        expect(css).not.toMatch(/\.dialog--warning \.dialog-header::before/);
    });

    // askConfirm da solo: le icone di partenza e il cambio fra un popup e il successivo
    const mount = () => {
        document.body.innerHTML = `<div id="confirm-overlay" style="display:none"><div class="dialog">
            <div class="dialog-header"><span id="confirm-icon" class="dialog-icon"></span><h3 id="confirm-title"></h3></div>
            <div id="confirm-body"></div><button id="confirm-cancel-btn"></button><button id="confirm-ok-btn"></button></div></div>`;
    };
    const iconOf = () => document.getElementById('confirm-icon')!.querySelector('.icon')?.className ?? '';
    const cases: [string, Parameters<typeof import('../src/services/ui').askConfirm>[0], string][] = [
        ['avviso', { title: 't', bodyHtml: '', warning: true }, 'icon-alert'],
        ['distruttivo', { title: 't', bodyHtml: '', danger: true }, 'icon-alert'],
        ['conferma semplice', { title: 't', bodyHtml: '' }, 'icon-info'],
        ['icona scelta', { title: 't', bodyHtml: '', warning: true, icon: 'upload' }, 'icon-upload'],
        ['icona scelta senza avviso', { title: 't', bodyHtml: '', icon: 'shield' }, 'icon-shield'],
    ];
    for (const [label, opts, expected] of cases) {
        it(`askConfirm: ${label} → ${expected}`, async () => {
            mount();
            const { askConfirm } = await import('../src/services/ui');
            const done = askConfirm(opts);
            expect(iconOf()).toContain(expected);
            document.getElementById('confirm-cancel-btn')!.click();
            await done;
        });
    }
    it('askConfirm: il popup dopo non eredita l\'icona del precedente', async () => {
        mount();
        const { askConfirm } = await import('../src/services/ui');
        const first = askConfirm({ title: 'a', bodyHtml: '', icon: 'upload' });
        document.getElementById('confirm-cancel-btn')!.click();
        await first;
        const second = askConfirm({ title: 'b', bodyHtml: '' });
        expect(iconOf()).toContain('icon-info');
        expect(iconOf()).not.toContain('icon-upload');
        document.getElementById('confirm-cancel-btn')!.click();
        await second;
    });
    it('askConfirm senza il posto per l\'icona non si rompe', async () => {
        mount();
        document.getElementById('confirm-icon')!.remove();
        const { askConfirm } = await import('../src/services/ui');
        const done = askConfirm({ title: 'a', bodyHtml: 'x' });
        document.getElementById('confirm-cancel-btn')!.click();
        expect(await done).toBe(false);
    });
});

describe('popup della versione: righe e note con icona (FR-004, FR-005)', () => {
    for (const targets of [['UAT'], ['UAT', 'PROD']]) {
        const several = targets.length > 1;
        it(`con ${targets.length} Target: icona di intestazione, 3 righe, ${several ? 3 : 2} note`, async () => {
            const ui = await toBuild(targets);
            await ui.startBuildRaw();
            const o = overlay(ui);
            expect(o.style.display).toBe('flex');
            expect(o.querySelector('#confirm-icon .icon-upload')).not.toBeNull();
            const facts = Array.from(o.querySelectorAll('.dlg-fact'));
            expect(facts.map(f => f.querySelector('dt')!.textContent)).toEqual(['Environment', 'Solution', 'Version']);
            facts.forEach(f => expect(f.querySelector(':scope > .icon'), f.textContent!).not.toBeNull());
            expect(facts[1]!.querySelector('dd')!.textContent).toContain('S1');
            expect(facts[2]!.querySelector('dd')!.textContent!.replace(/\s+/g, ' ')).toContain('1.0.0.2');
            const notes = Array.from(o.querySelectorAll('.dlg-note'));
            expect(notes.length).toBe(several ? 3 : 2);
            notes.forEach(n => expect(n.querySelector(':scope > .icon'), n.textContent!).not.toBeNull());
        });
    }
    it('con piu\' Target la tabella dei package resta, con l\'icona dell\'archivio su ogni file', async () => {
        const ui = await toBuild(['UAT', 'PROD']);
        await ui.startBuildRaw();
        const o = overlay(ui);
        const rows = o.querySelectorAll('.confirm-targets tbody tr');
        expect(rows.length).toBe(2);
        rows.forEach(r => expect(r.querySelector('td:last-child .icon-archive'), r.textContent!).not.toBeNull());
        expect(o.textContent).toContain('_managed_UAT.zip');
        expect(o.textContent).toContain('_managed_PROD.zip');
    });
    it('con un Target solo nessuna tabella', async () => {
        const ui = await toBuild(['UAT']);
        await ui.startBuildRaw();
        expect(overlay(ui).querySelector('.confirm-targets')).toBeNull();
    });
    it('il testo dice ancora dove scrive e come tornare indietro', async () => {
        const ui = await toBuild(['UAT']);
        await ui.startBuildRaw();
        const t = overlay(ui).textContent!.replace(/\s+/g, ' ');
        expect(t).toContain('one property of one solution');
        expect(t).toContain('cannot undo it');
        expect(t).toContain('turn off "Raise the version"');
    });
    it('la tabella dei package, anche nella revisione, lascia andare a capo il nome del file', () => {
        expect(rule(/\.data-table\.confirm-targets td\s*\{([^}]*)\}/)).toMatch(/white-space:\s*normal/);
    });
});

describe('popup «nessun suffisso»: l\'icona di avviso (FR-004)', () => {
    it('ha l\'icona di avviso nell\'intestazione', async () => {
        const ui = await boot(WORLD);
        await ui.openSolution('S1');
        await ui.startRename();
        await ui.nextRaw();
        expect(overlay(ui).style.display).toBe('flex');
        expect(overlay(ui).querySelector('#confirm-icon .icon-alert')).not.toBeNull();
        expect(overlay(ui).querySelector('.dialog')!.classList.contains('dialog--warning')).toBe(true);
    });
});

describe('pipeline: passi numerati, quello in corso si vede (FR-006, FR-008)', () => {
    const snapshot = (ui: { doc: Document }) => Array.from(ui.doc.querySelectorAll('#preview-progress .ph')).map(li => ({
        step: li.querySelector('.ph-dot')!.getAttribute('data-step'),
        state: /ph--(done|running|todo)/.exec(li.className)![1] as 'done' | 'running' | 'todo',
        label: li.querySelector('.ph-label')!.textContent!,
        check: li.querySelector('.ph-dot .icon-check') !== null,
        text: li.textContent!,
    }));

    for (const raise of [true, false]) {
        it(`con la versione ${raise ? 'da alzare' : 'invariata'}: ${raise ? 5 : 4} passi numerati da 1`, async () => {
            const ui = await toBuild(['UAT'], raise);
            await ui.startBuild();
            const s = snapshot(ui);
            expect(s.length).toBe(raise ? 5 : 4);
            expect(s.map(x => x.step)).toEqual(s.map((_, i) => String(i + 1)));
            expect(ui.doc.querySelector('#preview-progress ol.ph-list')).not.toBeNull();
            // il numero non entra nel testo del passo: resta solo il nome
            s.forEach(x => expect(x.text, x.label).toBe(x.label));
        });
    }

    it('durante l\'export gli stati sono sempre: fatti, al piu\' uno in corso, da fare; e solo avanti', async () => {
        const ui = await toBuild(['UAT']);
        await ui.startBuild();
        let doneBefore = 0;
        let sawRunning = false;
        for (let t = 0; t <= 6000; t += 100) {
            const s = snapshot(ui);
            if (s.length) {
                const states = s.map(x => x.state).join('');
                expect(states, `a ${t} ms`).toMatch(/^(done)*(running)?(todo)*$/);
                const done = s.filter(x => x.state === 'done').length;
                expect(done, `a ${t} ms i passi fatti non tornano indietro`).toBeGreaterThanOrEqual(doneBefore);
                doneBefore = done;
                if (s.some(x => x.state === 'running')) sawRunning = true;
                s.forEach(x => expect(x.check, `${x.label} a ${t} ms`).toBe(x.state === 'done'));
            }
            await ui.tick(100);
        }
        expect(sawRunning).toBe(true);
        expect(doneBefore, 'prima di cambiare schermata tutti i passi erano fatti').toBeGreaterThan(2);
    });

    it('a fine export tutti i passi sono fatti e la barra e\' piena', async () => {
        const ui = await toBuild(['UAT']);
        await ui.startBuild();
        let last: ReturnType<typeof snapshot> = [];
        let bar = false;
        for (let t = 0; t <= 8000; t += 50) {
            const s = snapshot(ui);
            if (s.length) { last = s; bar = ui.doc.querySelector('#preview-progress .pack-bar--done') !== null; }
            if (!s.length) break;
            await ui.tick(50);
        }
        expect(last.length).toBeGreaterThan(0);
        expect(last.every(x => x.state === 'done')).toBe(true);
        expect(bar).toBe(true);
    });

    it('il passo in corso e\' piu\' grande di quello fatto, e questo di quello da fare', () => {
        const scale = (re: RegExp) => Number(/scale\(([\d.]+)\)/.exec(rule(re))?.[1] ?? 1);
        const running = scale(/\.ph--running \.ph-dot\s*\{([^}]*)\}/);
        const done = scale(/\.ph--done \.ph-dot\s*\{([^}]*)\}/);
        expect(running).toBeGreaterThan(done);
        expect(done).toBeGreaterThan(1);
    });
    it('il numero lo scrive il CSS da data-step e sparisce quando c\'e\' la spunta', () => {
        expect(rule(/\.ph-dot::before\s*\{([^}]*)\}/)).toMatch(/attr\(data-step\)/);
        expect(rule(/\.ph--done \.ph-dot::before\s*\{([^}]*)\}/)).toMatch(/content:\s*none/);
    });
    it('la linea tra i passi si riempie con una transizione quando il passo e\' raggiunto', () => {
        expect(rule(/\.ph::after \{\s*(background: linear-gradient[^}]*)\}/)).toMatch(/transition:\s*transform/);
        expect(rule(/\.ph--done::after,\s*\.ph--running::after\s*\{([^}]*)\}/)).toMatch(/scaleX\(1\)/);
    });
    it('il passo in corso pulsa, e con prefers-reduced-motion si ferma (FR-007)', () => {
        expect(rule(/\.ph--running \.ph-dot\s*\{([^}]*)\}/)).toMatch(/animation:\s*ph-ring/);
        expect(css).toMatch(/@keyframes ph-ring/);
        const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g;
        const blocks = [...css.matchAll(reduced)].map(m => m[1]!).join('\n');
        expect(blocks).toMatch(/\.ph--running \.ph-dot\s*\{\s*animation:\s*none/);
        expect(blocks).toMatch(/\.ph::after[^{]*\{\s*transition:\s*none/);
    });
});
