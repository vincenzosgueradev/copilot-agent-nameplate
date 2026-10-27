/**
 * Interfaccia headless / MCP.
 *
 * Contratto: `specs/001-agent-rename-manager/contracts/headless-api.md`.
 *
 * Regola di confine: **l'headless si ferma al file**. `package` scrive su filesystem
 * locale e, solo con `options.newVersion` e `confirmVersionWrite: true`, alza la versione
 * della solution in DEV (l'unica scrittura su un environment, la stessa del dialog in UI); `deploy` e la rimozione di un unmanaged layer
 * restano dietro una conferma umana e non sono esposti qui.
 *
 * Nota sul runtime: la lettura del package usa `DOMParser`. Se l'host headless non lo espone
 * si fallisce subito con un messaggio esplicito, invece di morire più avanti con un errore
 * che non dice niente.
 */

import { writeArtifactSet } from './services/artifacts';
import { describeError } from './services/dataverse';
import { log } from './services/log';
import { runPackaging } from './services/packaging';
import { readPackage } from './services/package';
import { buildPatchPlan } from './services/patch';
import { exportSolution } from './services/export';
import { fetchAgentsAndSolutions, isSystemSolution } from './services/solutions';
import { DEFAULT_OPTIONS, type PackagingOptions } from './types';

type Json = Record<string, unknown>;

const ERRORS = {
    SOLUTION_NOT_FOUND: 'SOLUTION_NOT_FOUND',
    SOLUTION_IS_MANAGED: 'SOLUTION_IS_MANAGED',
    NO_AGENTS_IN_PACKAGE: 'NO_AGENTS_IN_PACKAGE',
    BOT_NAME_ELEMENT_MISSING: 'BOT_NAME_ELEMENT_MISSING',
    EXPORT_FAILED: 'EXPORT_FAILED',
    UNEXPECTED_NAME_OCCURRENCE: 'UNEXPECTED_NAME_OCCURRENCE',
    PACKAGE_VERIFICATION_FAILED: 'PACKAGE_VERIFICATION_FAILED',
    OUTPUT_FILE_EXISTS: 'OUTPUT_FILE_EXISTS',
    EXTRA_COMPONENTS_NOT_CONFIRMED: 'EXTRA_COMPONENTS_NOT_CONFIRMED',
    VERSION_WRITE_NOT_CONFIRMED: 'VERSION_WRITE_NOT_CONFIRMED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    CONNECTION_ERROR: 'CONNECTION_ERROR',
} as const;

const fail = (code: string, message: string): Json => ({ status: 'error', code, message });

/** Traduce un'eccezione nel codice del contratto, senza inventarne di nuovi. */
function toError(err: unknown): Json {
    const text = describeError(err);
    if (/<name>/.test(text) && /formato/i.test(text)) {
        return fail(ERRORS.BOT_NAME_ELEMENT_MISSING, text);
    }
    if (/holds no agent/i.test(text)) return fail(ERRORS.NO_AGENTS_IN_PACKAGE, text);
    if (/Not enough permissions/i.test(text)) return fail(ERRORS.PERMISSION_DENIED, text);
    if (/export/i.test(text)) return fail(ERRORS.EXPORT_FAILED, text);
    return fail(ERRORS.CONNECTION_ERROR, text);
}

function requireDom(): void {
    if (typeof DOMParser === 'undefined') {
        throw new Error(
            'this headless host does not expose DOMParser: reading the solution package '
            + 'requires a runtime with a DOM');
    }
}

async function listSolutions(): Promise<Json> {
    const { solutions } = await fetchAgentsAndSolutions(false);
    return {
        status: 'ok',
        solutions: solutions
            .filter(s => s.isVisible && !isSystemSolution(s) && s.agentCount > 0)
            .map(s => ({
                solutionId: s.solutionId,
                uniqueName: s.uniqueName,
                displayName: s.friendlyName,
                version: s.version,
                isManaged: s.isManaged,
                exportable: s.exportable,
                publisherPrefix: s.publisherPrefix,
                agentCount: s.agentCount,
            })),
    };
}

async function inspectPackage(input: Json): Promise<Json> {
    requireDom();
    const name = String(input.solutionUniqueName ?? '');
    const managed = input.managed !== false;
    if (!name) return fail(ERRORS.SOLUTION_NOT_FOUND, 'solutionUniqueName mancante');

    const exported = await exportSolution(name, managed);
    const pkg = readPackage(exported.bytes);
    return {
        status: 'ok',
        package: {
            uniqueName: pkg.uniqueName,
            version: pkg.version,
            managed: pkg.managed,
            publisher: { uniqueName: pkg.publisherUniqueName, prefix: pkg.publisherPrefix },
            entryCount: pkg.entries.length,
            export: { mode: exported.mode, seconds: Number(exported.seconds.toFixed(1)) },
        },
        agents: pkg.agents.map(a => ({
            schemaName: a.schemaName,
            file: a.file,
            name: a.name,
            baseName: a.baseName,
            currentSuffix: a.currentSuffix,
            publishOnImport: a.publishOnImport,
            channels: a.channels,
        })),
        inventory: pkg.inventory,
        compatibility: {
            fingerprint: pkg.fingerprint,
            drift: pkg.drift,
            nameOccurrences: pkg.nameOccurrences,
        },
        suffixVariable: pkg.suffixVariable,
    };
}

function optionsFrom(input: Json): PackagingOptions {
    const o = (input.options ?? {}) as Partial<PackagingOptions>;
    return {
        newVersion: typeof o.newVersion === 'string' && o.newVersion.trim() ? o.newVersion.trim() : null,
        publishOnImport: o.publishOnImport ?? DEFAULT_OPTIONS.publishOnImport,
        publishByAgent: o.publishByAgent ?? {},
        keepSourceArtifacts: o.keepSourceArtifacts !== false,
    };
}

async function previewPatch(input: Json): Promise<Json> {
    requireDom();
    const name = String(input.solutionUniqueName ?? '');
    const suffix = String(input.suffix ?? '');
    const exported = await exportSolution(name, true);
    const pkg = readPackage(exported.bytes);
    const selected = (input.agents as string[] | undefined) ?? pkg.agents.map(a => a.schemaName);
    const plan = buildPatchPlan(pkg, suffix, selected, optionsFrom(input));
    const touched = new Set(plan.filter(c => c.state !== 'no-change').map(c => c.file));
    return {
        status: 'ok',
        changes: plan.map(c => ({
            file: c.file,
            element: c.element,
            before: c.before,
            after: c.after,
            state: c.state,
            nameLength: c.element === 'name' ? c.after.length : undefined,
            exceedsTeamsLimit: c.exceedsTeamsLimit,
        })),
        untouched: {
            entries: pkg.entries.length - touched.size,
            note: 'schemaname, nomi di cartella e di file, GUID, [Content_Types].xml, customizations.xml',
        },
    };
}

async function packageSolution(input: Json): Promise<Json> {
    requireDom();
    const name = String(input.solutionUniqueName ?? '');
    const suffix = String(input.suffix ?? '');
    const outputDirectory = String(input.outputDirectory ?? '');
    if (!outputDirectory) {
        return fail(ERRORS.OUTPUT_FILE_EXISTS, 'outputDirectory mancante');
    }
    const options = optionsFrom(input);

    // La scrittura della versione in DEV e' l'unica sull'ambiente: in UI e' un dialog, qui un flag
    if (options.newVersion && input.confirmVersionWrite !== true) {
        return fail(ERRORS.VERSION_WRITE_NOT_CONFIRMED,
            `the version of solution ${name} would be changed in DEV to ${options.newVersion}: `
            + 'pass confirmVersionWrite: true to allow it, or leave options.newVersion empty to leave the environment untouched');
    }

    const first = await exportSolution(name, true);
    const probe = readPackage(first.bytes);
    const selected = (input.agents as string[] | undefined) ?? probe.agents.map(a => a.schemaName);

    // I due assensi espliciti che in UI sono dialog: qui sono flag, e senza flag si rifiuta
    const unexpected = probe.nameOccurrences.filter(o => !o.expected);
    if (unexpected.length && input.confirmUnexpectedOccurrences !== true) {
        return fail(ERRORS.UNEXPECTED_NAME_OCCURRENCE,
            'the display name appears in unexpected places: '
            + unexpected.map(o => `${o.file} ${o.locator}`).join('; '));
    }
    const extra = probe.inventory.filter(c => !c.relatedToSelectedAgent);
    if (extra.length && input.confirmExtraComponents !== true) {
        return fail(ERRORS.EXTRA_COMPONENTS_NOT_CONFIRMED,
            'the package contains components beyond the agent: '
            + extra.map(c => `${c.kind} x${c.count}`).join('; '));
    }

    const result = await runPackaging(name, suffix, selected, options);
    if (!result.valid) {
        return fail(ERRORS.PACKAGE_VERIFICATION_FAILED,
            'verification failed on at least one of the two archives');
    }

    const confirmations = [
        ...(unexpected.length ? [{ what: 'unexpected occurrences of the name', confirmedAt: new Date().toISOString() }] : []),
        ...(extra.length ? [{ what: 'componenti oltre all\'agent', confirmedAt: new Date().toISOString() }] : []),
    ];
    const written = await writeArtifactSet(outputDirectory, {
        result,
        suffix,
        options,
        sourceEnvironmentUrl: String(input.sourceEnvironmentUrl ?? ''),
        user: String(input.user ?? 'headless'),
        confirmations,
    });

    return {
        status: 'ok',
        artifactSet: {
            folderPath: written.set.folderPath,
            manifestPath: written.set.manifestPath,
            totalBytes: written.set.totalBytes,
            export: { mode: result.exportMode, seconds: Number(result.exportSeconds.toFixed(1)) },
            files: written.set.files,
        },
        changes: result.plan.map(c => ({ file: c.file, before: c.before, after: c.after })),
    };
}

/**
 * Punto di ingresso headless. Un'operazione non riconosciuta non viene "interpretata":
 * si risponde con l'elenco di quelle disponibili.
 */
export async function invokeHeadless(input: Json): Promise<Json> {
    const op = String(input.operation ?? '');
    try {
        switch (op) {
            case 'listSolutions': return await listSolutions();
            case 'inspectPackage': return await inspectPackage(input);
            case 'previewPatch': return await previewPatch(input);
            case 'package': return await packageSolution(input);
            case 'deploy':
            case 'removeUnmanagedLayer':
                return fail(ERRORS.PERMISSION_DENIED,
                    `"${op}" changes an environment and stays behind a human confirmation: `
                    + 'it is not available in headless');
            default:
                return fail(ERRORS.CONNECTION_ERROR,
                    `unknown operation "${op}". Available: listSolutions, inspectPackage, `
                    + 'previewPatch, package');
        }
    } catch (err) {
        log(`Headless "${op}" failed: ${describeError(err)}`, 'error');
        return toError(err);
    }
}

// PPTB carica l'entry headless e cerca il punto di ingresso sul global.
(globalThis as unknown as { invokeHeadless?: unknown }).invokeHeadless = invokeHeadless;
