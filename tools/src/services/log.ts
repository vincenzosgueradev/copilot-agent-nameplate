/// <reference types="@pptb/types" />

/**
 * Log delle operazioni (FR-016, FR-017).
 *
 * Tiene in memoria le voci e le rispecchia nel pannello laterale. Serve a due scopi:
 * mostrare l'avanzamento all'utente, ed esportare un tracciato di cosa è stato fatto.
 * Non lascia mai il dispositivo.
 */

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}

const entries: LogEntry[] = [];
let mount: HTMLElement | null = null;

/** Collega il pannello in cui disegnare le voci. Senza mount il log resta solo in memoria. */
export function attachLog(el: HTMLElement): void {
    mount = el;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function log(message: string, level: LogLevel = 'info'): void {
    const now = new Date();
    entries.push({ timestamp: now.toISOString(), level, message });
    if (!mount) return;
    const row = document.createElement('div');
    row.className = `log-entry log-entry--${level}`;
    row.innerHTML =
        `<span class="log-timestamp">${now.toTimeString().slice(0, 8)}</span>${escapeHtml(message)}`;
    mount.appendChild(row);
    mount.scrollTop = mount.scrollHeight;
}

export function clearLog(): void {
    entries.length = 0;
    if (mount) mount.innerHTML = '';
}

export function getEntries(): readonly LogEntry[] {
    return entries;
}

export function toJson(): string {
    return JSON.stringify(entries, null, 2);
}

/** CSV con le virgolette raddoppiate, così un messaggio che contiene virgole non rompe le colonne. */
export function toCsv(): string {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const head = 'timestamp,level,message';
    const rows = entries.map(e => [e.timestamp, e.level, e.message].map(esc).join(','));
    return [head, ...rows].join('\r\n');
}
