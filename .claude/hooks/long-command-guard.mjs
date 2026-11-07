// PreToolUse hook (Bash and PowerShell): a long command must not run silently.
// Rule (root CLAUDE.md, 2026-11-07): every command longer than a minute runs in the background, without a
// "| tail" / "| head" that buffers its output, and with a Monitor that prints a progress line every minute.
// Exit 2 blocks the call and sends the message to Claude; exit 0 lets it through.
import { readFileSync } from 'node:fs';

// Commands known to take minutes or hours. Add a pattern here when a new slow script appears.
// A pattern must match the START of a command (after && ; || or a new line): a command that only mentions the name
// (git commit -m "...", grep, sed, echo) is not a long run.
export const LONG = [
    /^(npm|pnpm|yarn)\s+run\s+test:mutation\b/,
    /^(npm|pnpm|yarn)\s+run\s+test:full\b/,
    /^(npm|pnpm|yarn)\s+run\s+smoke:multi\b/,
    /^(npm|pnpm|yarn)\s+run\s+smoke\b/,
    /^node\s+\S*mutation-check\.mjs\b/,
];
const BUFFERING_PIPE = /\|\s*(tail|head|less|more)\b/;
const HARMLESS = /--dry-run|--help/;

// Split on && || ; and new lines (not on a single |, so the pipe stays in its segment).
const segments = (command) => command.split(/&&|\|\||;|\r?\n/).map((s) => s.trim()).filter(Boolean);

export function check(input) {
    const command = String(input?.tool_input?.command ?? '');
    const hit = segments(command).find((seg) => LONG.some((re) => re.test(seg)));
    if (!hit) return null;
    if (HARMLESS.test(hit)) return null;
    if (BUFFERING_PIPE.test(hit)) {
        return 'Blocked: a long command piped into tail/head/less/more shows nothing until it ends. Run it in the background without the pipe and attach a Monitor that prints one real progress line every 60 seconds (done/total, survivors or errors, time left).';
    }
    if (input?.tool_input?.run_in_background !== true) {
        return 'Blocked: a long command must run with run_in_background and a Monitor that prints one progress line every 60 seconds (done/total, survivors or errors, time left). Say the estimated duration before starting.';
    }
    return null;
}

// Run as a hook only when executed directly, so the test can import check().
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
    let input = {};
    try {
        input = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        process.exit(0); // never block on a malformed payload
    }
    const message = check(input);
    if (message) {
        process.stderr.write(message + '\n');
        process.exit(2);
    }
}
