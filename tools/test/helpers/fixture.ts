/**
 * Generatore di solution package sintetici, con la stessa struttura di un export reale
 * (research.md §9). Serve perche' i package veri contengono dati del tenant e non stanno nel
 * repository: i test devono poter girare ovunque, e con agent in qualunque stato.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export interface AgentSpec {
    /** `schemaname`, per esempio `ava_alpha`. */
    schema: string;
    /** `<name>` di `bot.xml`: il display name, suffisso compreso. */
    name: string;
    /**
     * `<name>` del componente GPT. Default: il nome base (agent rinominato dopo la creazione).
     * Passare il nome intero per un agent creato gia' con il suffisso.
     */
    gptName?: string;
    /** `null` = chiave assente ("non specificato"). */
    publishOnImport: boolean | null;
    /** Con `false` mancano `channels` e `isLightweightBot`, come in un agent mai collegato. */
    connected?: boolean;
    /** Numero di topic da generare. Default 2. */
    topics?: number;
}

export interface PackageSpec {
    uniqueName?: string;
    version?: string;
    managed?: boolean;
    prefix?: string;
    agents: AgentSpec[];
    /** Cartelle aggiuntive di primo livello, per l'inventario (es. `workflows/`). */
    extraFolders?: string[];
    /** Aggiunge una environment variable di tipo String. */
    withEnvVar?: boolean;
}

const escapeXml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function botXml(a: AgentSpec): string {
    return `<bot schemaname="${a.schema}">
  <authenticationmode>2</authenticationmode>
  <authenticationtrigger>1</authenticationtrigger>
  <iconbase64>iVBORw0KGgo=</iconbase64>
  <iscustomizable>1</iscustomizable>
  <language>1033</language>
  <name>${escapeXml(a.name)}</name>
  <runtimeprovider>0</runtimeprovider>
  <template>default-2.1.0</template>
  <timezoneruleversionnumber>4</timezoneruleversionnumber>
</bot>`;
}

export function configJson(a: AgentSpec): string {
    const connected = a.connected !== false;
    const cfg: Record<string, unknown> = { $kind: 'BotConfiguration' };
    if (connected) {
        cfg.channels = [
            { $kind: 'ChannelDefinition', channelId: 'MsTeams' },
            { $kind: 'ChannelDefinition', channelId: 'Microsoft365Copilot' },
        ];
    }
    cfg.settings = { GenerativeActionsEnabled: true };
    cfg.isAgentConnectable = true;
    if (a.publishOnImport !== null) cfg.publishOnImport = a.publishOnImport;
    cfg.gPTSettings = { $kind: 'GPTSettings', defaultSchemaName: `${a.schema}.gpt.default` };
    if (connected) cfg.isLightweightBot = false;
    cfg.aISettings = { $kind: 'AISettings', useModelKnowledge: true, contentModeration: 'Low' };
    cfg.recognizer = { $kind: 'GenerativeAIRecognizer' };
    return JSON.stringify(cfg, null, 2);
}

function botComponentXml(schema: string, component: string, name: string): string {
    return `<botcomponent schemaname="${schema}.${component}">
  <componenttype>${component.startsWith('gpt') ? 15 : 9}</componenttype>
  <iscustomizable>0</iscustomizable>
  <name>${escapeXml(name)}</name>
  <parentbotid>
    <schemaname>${schema}</schemaname>
  </parentbotid>
  <statecode>0</statecode>
  <statuscode>1</statuscode>
</botcomponent>`;
}

function solutionXml(spec: PackageSpec): string {
    return `<ImportExportXml version="9.2.26092.158" SolutionPackageVersion="9.2" languagecode="1033" generatedBy="CrmLive" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" OrganizationVersion="9.2.26092.158" OrganizationSchemaType="Standard" CRMServerServiceabilityVersion="9.2.26092.00168">
  <SolutionManifest>
    <UniqueName>${spec.uniqueName ?? 'testSolution'}</UniqueName>
    <LocalizedNames><LocalizedName description="testSolution" languagecode="1033" /></LocalizedNames>
    <Descriptions />
    <Version>${spec.version ?? '1.0.0.2'}</Version>
    <Managed>${spec.managed === false ? 0 : 1}</Managed>
    <Publisher>
      <UniqueName>Contoso</UniqueName>
      <LocalizedNames><LocalizedName description="Contoso" languagecode="1033" /></LocalizedNames>
      <Descriptions />
      <CustomizationPrefix>${spec.prefix ?? 'ava'}</CustomizationPrefix>
      <CustomizationOptionValuePrefix>91524</CustomizationOptionValuePrefix>
    </Publisher>
    <RootComponents />
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>`;
}

/** Le entry del package come mappa percorso → byte, prima della compressione. */
export function packageFiles(spec: PackageSpec): Record<string, Uint8Array> {
    const files: Record<string, string> = {
        '[Content_Types].xml':
            '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /></Types>',
        'solution.xml': solutionXml(spec),
        'customizations.xml': '<ImportExportXml><Entities></Entities></ImportExportXml>',
    };
    for (const a of spec.agents) {
        files[`bots/${a.schema}/bot.xml`] = botXml(a);
        files[`bots/${a.schema}/configuration.json`] = configJson(a);
        const base = a.name.replace(/\s\[[^\]]{1,20}\]$/, '');
        files[`botcomponents/${a.schema}.gpt.default/botcomponent.xml`] =
            botComponentXml(a.schema, 'gpt.default', a.gptName ?? base);
        files[`botcomponents/${a.schema}.gpt.default/data`] = 'kind: GptComponentMetadata\n';
        for (let i = 1; i <= (a.topics ?? 2); i++) {
            files[`botcomponents/${a.schema}.topic.Topic${i}/botcomponent.xml`] =
                botComponentXml(a.schema, `topic.Topic${i}`, `Topic ${i}`);
            files[`botcomponents/${a.schema}.topic.Topic${i}/data`] = `kind: AdaptiveDialog\nid: t${i}\n`;
        }
    }
    for (const folder of spec.extraFolders ?? []) files[`${folder}item.xml`] = '<item/>';
    if (spec.withEnvVar) {
        files['environmentvariabledefinitions/ava_Suffix/environmentvariabledefinition.xml'] =
            '<environmentvariabledefinition schemaname="ava_Suffix"><type>100000000</type></environmentvariabledefinition>';
    }
    const out: Record<string, Uint8Array> = {};
    for (const [path, content] of Object.entries(files)) out[path] = strToU8(content);
    return out;
}

export function makePackage(spec: PackageSpec): Uint8Array {
    return zipSync(packageFiles(spec));
}

/** Rilegge uno zip come mappa di byte, per i confronti. */
export function readEntries(bytes: Uint8Array): Record<string, Uint8Array> {
    return unzipSync(bytes);
}

export const text = (data: Uint8Array | undefined): string => (data ? strFromU8(data) : '');
