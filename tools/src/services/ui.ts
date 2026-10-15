/// <reference types="@pptb/types" />

/**
 * Indicatori di avanzamento condivisi.
 *
 * Marcatori circolari coerenti con lo stepper, mai emoji: a seconda del font le emoji
 * si rendono come quadratini (FR-053). Servono all'avanzamento reale dell'export, che
 * può durare da 13 secondi a 5 minuti e non può essere uno spinner muto (FR-094).
 */

export type DotState = 'pending' | 'running' | 'success' | 'error' | 'skipped';

const DOT_GLYPH: Record<DotState, string> = {
    pending: '',
    running: '',
    success: '✓',
    error: '✕',
    skipped: '–',
};

export function statusDotHtml(id: string, s: DotState = 'pending'): string {
    return `<span class="status-dot status-dot--${s}" id="${id}" aria-label="${s}">${DOT_GLYPH[s]}</span>`;
}

export function setStatusDot(id: string, s: DotState): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `status-dot status-dot--${s}`;
    el.textContent = DOT_GLYPH[s];
    el.setAttribute('aria-label', s);
}

// ── Dialog di conferma ───────────────────────────────────────────────────────

/**
 * Conferma modale. Serve dove la spec richiede un assenso esplicito e non un semplice
 * avviso: componenti extra nel package (FR-091), nome trovato in un punto non noto
 * (FR-096), sovrascrittura di un artifact set esistente (FR-074).
 */
export interface ConfirmOptions {
    title: string;
    bodyHtml: string;
    okLabel?: string;
    /** Rende il pulsante di conferma "distruttivo". */
    danger?: boolean;
}

/** Risolve `true` sulla conferma; `false` su annulla o Escape. */
export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
    const overlay = document.getElementById('confirm-overlay')!;
    const title = document.getElementById('confirm-title')!;
    const body = document.getElementById('confirm-body')!;
    const okBtn = document.getElementById('confirm-ok-btn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('confirm-cancel-btn') as HTMLButtonElement;

    return new Promise(resolve => {
        title.textContent = opts.title;
        body.innerHTML = opts.bodyHtml;
        okBtn.textContent = opts.okLabel ?? 'Confirm';
        okBtn.className = opts.danger ? 'btn btn--danger' : 'btn btn--primary';
        overlay.style.display = 'flex';
        okBtn.focus();

        const finish = (result: boolean) => {
            overlay.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(false); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
    });
}
