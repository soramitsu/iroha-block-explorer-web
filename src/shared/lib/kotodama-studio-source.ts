export interface KotodamaStudioEntrypoint {
  name: string
  kind: 'kotoage' | 'hajimari' | 'view'
  permission: string | null
}

export interface KotodamaStudioTrigger {
  id: string
  entrypoint: string
  mode: 'manual' | 'pre_commit' | 'schedule'
}

export interface KotodamaStudioWorkspaceSummary {
  states: string[]
  entrypoints: KotodamaStudioEntrypoint[]
  triggers: KotodamaStudioTrigger[]
}

export interface KotodamaStudioSourceSections {
  stateSection: string
  entrypointSection: string
  triggerSection: string
}

export interface KotodamaStudioSourceInput {
  title: string
  dataspace: string
  authority: string
  chainId: string
  description: string
  sections: KotodamaStudioSourceSections
  summary: KotodamaStudioWorkspaceSummary
}

function trimSection(value: string): string {
  return value
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function buildKotodamaStudioSource(input: KotodamaStudioSourceInput): string {
  const sections = [
    trimSection(input.sections.stateSection),
    trimSection(input.sections.entrypointSection),
    trimSection(input.sections.triggerSection),
  ].filter((section) => section.length > 0);

  const intro = [
    `// dataspace: ${input.dataspace || 'universal'}`,
    `// chain_id: ${input.chainId}`,
    `// authority: ${input.authority}`,
    `// description: ${input.description || 'Made in Kotodama Studio.'}`,
  ].join('\n');

  const body = sections.length > 0
    ? sections.join('\n\n')
    : '  kotoage fn main() {\n    info("Build your first colorful rule.");\n  }';

  return [
    intro,
    '',
    `seiyaku ${input.title} {`,
    body,
    '}',
  ].join('\n');
}

export function describeKotodamaStudioSummary(summary: KotodamaStudioWorkspaceSummary): string {
  const parts = [
    `${summary.entrypoints.length} entrypoint${summary.entrypoints.length === 1 ? '' : 's'}`,
    `${summary.triggers.length} trigger${summary.triggers.length === 1 ? '' : 's'}`,
    `${summary.states.length} state field${summary.states.length === 1 ? '' : 's'}`,
  ];

  const highlightedEntrypoints = summary.entrypoints.slice(0, 3).map((entrypoint) => entrypoint.name);
  if (!highlightedEntrypoints.length) return parts.join(', ');

  return `${parts.join(', ')}. Main actions: ${highlightedEntrypoints.join(', ')}.`;
}
