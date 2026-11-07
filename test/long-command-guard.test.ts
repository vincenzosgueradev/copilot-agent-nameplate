// The hook that stops a long command from running silently (root CLAUDE.md, 2026-11-07).
// Oracle: the rule text. Long = mutation, full test run, multi smoke. Allowed only in the background, with no
// buffering pipe. Quick commands and dry runs are never touched.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { check } from '../.claude/hooks/long-command-guard.mjs';

const call = (command: string, background = false) => check({ tool_input: { command, run_in_background: background } });

describe('long-command-guard', () => {
    const longCommands = ['npm run test:mutation', 'npm run test:full', 'node scripts/mutation-check.mjs chunk:1/4', 'npm run smoke:multi -- a.zip', 'npm run smoke -- a.zip'];

    it.each(longCommands)('blocks %s in the foreground', (c) => {
        expect(call(c, false)).toMatch(/run_in_background/);
    });
    it.each(longCommands)('allows %s in the background', (c) => {
        expect(call(c, true)).toBeNull();
    });
    it.each(['tail -25', 'head -5', 'less', 'more'])('blocks a long command piped into %s even in the background', (pipe) => {
        expect(call(`npm run test:mutation | ${pipe}`, true)).toMatch(/tail\/head/);
    });
    it('blocks the pipe even with other output redirection', () => {
        expect(call('npm run test:mutation 2>&1 | tail -25', true)).toMatch(/tail\/head/);
    });
    it.each(['npm test', 'npx tsc --noEmit', 'npm run build', 'git status', 'npm run validate | tail -3'])('never touches the quick command %s', (c) => {
        expect(call(c, false)).toBeNull();
    });
    it.each([
        'git commit -m "chore: run npm run test:mutation in full before a release"',
        'grep -n "test:full" package.json',
        "sed -i 's/test:mutation/x/' CLAUDE.md",
        'echo "npm run test:mutation | tail -5"',
        'cat scripts/mutation-check.mjs | head -20',
    ])('never blocks a command that only mentions a long run: %s', (c) => {
        expect(call(c, false)).toBeNull();
    });
    it('still catches a long run after cd or another command', () => {
        expect(call('cd tools/x && npm run test:mutation | tail -5', true)).toMatch(/tail\/head/);
        expect(call('cd tools/x && npm run test:full', false)).toMatch(/run_in_background/);
        expect(call('git status; node scripts/mutation-check.mjs', false)).toMatch(/run_in_background/);
    });
    it('lets a dry run through', () => {
        expect(call('node scripts/mutation-check.mjs --changed-since=abc123 --dry-run | head -3', false)).toBeNull();
    });
    it('does not block on a payload without a command', () => {
        expect(check({})).toBeNull();
        expect(check(null)).toBeNull();
    });

    it('as a process: exit 2 with a message when blocked, exit 0 when allowed, exit 0 on garbage input', () => {
        const run = (stdin: string) => spawnSync('node', ['.claude/hooks/long-command-guard.mjs'], { input: stdin, encoding: 'utf8' });
        const blocked = run(JSON.stringify({ tool_input: { command: 'npm run test:mutation | tail -5' } }));
        expect(blocked.status).toBe(2);
        expect(blocked.stderr).toMatch(/Blocked/);
        expect(run(JSON.stringify({ tool_input: { command: 'npm test' } })).status).toBe(0);
        expect(run('not json').status).toBe(0);
    });
});
