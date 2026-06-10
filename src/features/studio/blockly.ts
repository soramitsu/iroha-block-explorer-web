import * as Blockly from 'blockly';
import type { KotodamaStudioWorkspaceSummary } from '@/shared/lib/kotodama-studio-source';

export type StudioToolboxMode = 'basic' | 'advanced';
export type StudioTemplateId = 'reward' | 'watchdog' | 'subscription';

export interface StudioSections {
  stateSection: string
  entrypointSection: string
  triggerSection: string
}

export interface StudioWorkspaceIssue {
  code:
    | 'duplicate_state'
    | 'duplicate_entrypoint'
    | 'duplicate_trigger'
    | 'invalid_account_literal'
    | 'invalid_asset_literal'
    | 'raw_query_payload'
  severity: 'error' | 'warning'
  message: string
}

interface StudioToolboxBlockItem {
  kind: 'block'
  type: string
}

interface StudioToolboxCategory {
  kind: 'category'
  name: string
  categorystyle: string
  contents: StudioToolboxBlockItem[]
}

interface StudioToolboxInfo {
  kind: 'categoryToolbox'
  contents: StudioToolboxCategory[]
}

const STUDIO_STATE_CHECK = 'StudioState';
const STUDIO_ENTRYPOINT_CHECK = 'StudioEntrypoint';
const STUDIO_TRIGGER_CHECK = 'StudioTrigger';
const STUDIO_ACTION_CHECK = 'StudioAction';
const STUDIO_ACCOUNT_CHECK = 'StudioAccount';
const STUDIO_ASSET_CHECK = 'StudioAsset';
const STUDIO_NAME_CHECK = 'StudioName';
const STUDIO_JSON_CHECK = 'StudioJson';
const STUDIO_BLOB_CHECK = 'StudioBlob';
const STUDIO_STATE_VALUE_CHECK = 'StudioStateValue';
const STUDIO_SCALAR_AND_STATE_CHECKS = ['String', 'Number', 'Boolean', STUDIO_STATE_VALUE_CHECK];
const STUDIO_DETAIL_VALUE_CHECKS = [...STUDIO_SCALAR_AND_STATE_CHECKS, STUDIO_JSON_CHECK];
const STUDIO_INFO_VALUE_CHECKS = [...STUDIO_DETAIL_VALUE_CHECKS, STUDIO_ACCOUNT_CHECK, STUDIO_ASSET_CHECK, STUDIO_NAME_CHECK];
const STUDIO_STATE_DEFAULT_CHECKS = ['Number', 'Boolean', STUDIO_JSON_CHECK, STUDIO_BLOB_CHECK, STUDIO_STATE_VALUE_CHECK];
const STUDIO_COMPARABLE_CHECKS = ['String', 'Number', 'Boolean', STUDIO_STATE_VALUE_CHECK];
const STUDIO_EMPTY_REFERENCE_VALUE = '__studio_missing_reference__';
const STUDIO_INVALID_REFERENCE_REASON = 'STUDIO_INVALID_REFERENCE';
const STUDIO_INVALID_REFERENCE_DEPENDENCY_REASON = 'STUDIO_INVALID_REFERENCE_DEPENDENCY';
const STUDIO_REFERENCE_WARNING_ID = 'studio-reference-warning';
const STUDIO_REFERENCE_DEPENDENCY_WARNING_ID = 'studio-reference-dependency-warning';

const STUDIO_THEME_NAME = 'kotodama-studio-theme';
const ROOT_BLOCK_TYPE = 'studio_contract_root';

const STUDIO_GENERATOR = new Blockly.Generator('KotodamaStudio');
let registered = false;
let studioBlocklyTheme: Blockly.Theme | null = null;

STUDIO_GENERATOR.INDENT = '  ';
STUDIO_GENERATOR.scrub_ = (_block, code) => code;

function valueOrFallback(block: Blockly.Block, inputName: string, fallback: string): string {
  const code = STUDIO_GENERATOR.valueToCode(block, inputName, 0);
  return code && code.trim().length > 0 ? code : fallback;
}

function statementOrEmpty(block: Blockly.Block, inputName: string): string {
  return STUDIO_GENERATOR.statementToCode(block, inputName).trimEnd();
}

function quoted(fieldValue: string): string {
  return JSON.stringify(fieldValue);
}

function blockField(block: Blockly.Block, fieldName: string, fallback = ''): string {
  const value = block.getFieldValue(fieldName);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeStudioIdentifier(value: string | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return fallback;

  const normalized = trimmed
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^([^A-Za-z_])/, '_$1');

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeStudioTrimmedLiteral(value: string | number | null | undefined, fallback: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function uniqueStudioValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function collectStudioDuplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((left, right) => left.localeCompare(right));
}

function isStudioBlockAvailable(block: Blockly.Block): boolean {
  return block.isEnabled() && !block.getInheritedDisabled();
}

function collectStudioStateNames(workspace: Blockly.Workspace): string[] {
  return uniqueStudioValues(
    workspace
      .getBlocksByType('studio_state', false)
      .filter(isStudioBlockAvailable)
      .map((block) => blockField(block, 'NAME', 'counter'))
  );
}

function collectStudioFieldValues(
  workspace: Blockly.Workspace,
  blockType: string,
  fieldName: string,
  fallback: string
): string[] {
  return workspace
    .getBlocksByType(blockType, false)
    .filter(isStudioBlockAvailable)
    .map((block) => blockField(block, fieldName, fallback));
}

function collectStudioPublicEntrypointNames(workspace: Blockly.Workspace): string[] {
  return uniqueStudioValues(
    workspace
      .getBlocksByType('studio_entrypoint', false)
      .filter(isStudioBlockAvailable)
      .filter((block) => blockField(block, 'KIND', 'kotoage') === 'kotoage')
      .map((block) => blockField(block, 'NAME', 'celebrate'))
  );
}

function studioIdentifierValidator(fallback: string) {
  return (value: string | number | null | undefined) => normalizeStudioIdentifier(
    typeof value === 'string' ? value : String(value ?? ''),
    fallback
  );
}

function studioTrimmedLiteralValidator(fallback: string) {
  return (value: string | number | null | undefined) => normalizeStudioTrimmedLiteral(value, fallback);
}

function hasStudioAccountLiteralShape(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value.trim());
}

function hasStudioAssetLiteralShape(value: string): boolean {
  return /^[^\s#]+#[^\s#]+$/.test(value.trim());
}

function buildStudioReferenceOptions(values: string[], currentValue: string, emptyLabel: string): Array<[string, string]> {
  const options = uniqueStudioValues(values).map((value) => [value, value] as [string, string]);
  if (!options.length) {
    return [[emptyLabel, STUDIO_EMPTY_REFERENCE_VALUE]];
  }

  if (currentValue.length > 0 && currentValue !== STUDIO_EMPTY_REFERENCE_VALUE && !options.some(([, value]) => value === currentValue)) {
    return [[`${currentValue} (missing)`, currentValue], ...options];
  }

  return options;
}

function createStudioReferenceDropdown(
  getValues: (workspace: Blockly.Workspace) => string[],
  emptyLabel: string
): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(function(this: Blockly.FieldDropdown) {
    const sourceBlock = this.getSourceBlock();
    const workspace = sourceBlock?.workspace;
    return buildStudioReferenceOptions(workspace ? getValues(workspace) : [], this.getValue() ?? '', emptyLabel);
  });
}

function clearStudioReferenceValidation(block: Blockly.Block) {
  block.setDisabledReason(false, STUDIO_INVALID_REFERENCE_REASON);
  block.setDisabledReason(false, STUDIO_INVALID_REFERENCE_DEPENDENCY_REASON);
  block.setWarningText(null, STUDIO_REFERENCE_WARNING_ID);
  block.setWarningText(null, STUDIO_REFERENCE_DEPENDENCY_WARNING_ID);
}

function findNearestStudioStatementAncestor(block: Blockly.Block): Blockly.Block | null {
  let current = block.getParent();
  while (current) {
    if (current.previousConnection || current.type === ROOT_BLOCK_TYPE) {
      return current;
    }
    current = current.getParent();
  }

  return null;
}

function reconcileStudioReferenceField(
  block: Blockly.Block,
  fieldName: string,
  validValues: string[]
): boolean {
  const field = block.getField(fieldName);
  if (field instanceof Blockly.FieldDropdown && field.isOptionListDynamic()) {
    field.getOptions(false);
  }

  const currentValue = block.getFieldValue(fieldName) ?? '';
  const nextValue = validValues.length > 0
    ? validValues.includes(currentValue) ? currentValue : validValues[0]!
    : STUDIO_EMPTY_REFERENCE_VALUE;

  if (currentValue === nextValue) return false;
  block.setFieldValue(nextValue, fieldName);
  return true;
}

function registerBlocks() {
  Blockly.Extensions.register('studio_state_identifier_extension', function(this: Blockly.Block) {
    const field = this.getField('NAME');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioIdentifierValidator('counter'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_entrypoint_identifier_extension', function(this: Blockly.Block) {
    const field = this.getField('NAME');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioIdentifierValidator('celebrate'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_query_alias_extension', function(this: Blockly.Block) {
    const field = this.getField('ALIAS');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioIdentifierValidator('result'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_entrypoint_permission_extension', function(this: Blockly.Block) {
    const field = this.getField('PERMISSION');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioIdentifierValidator('Builder'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_account_literal_extension', function(this: Blockly.Block) {
    const field = this.getField('VALUE');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioTrimmedLiteralValidator('alice@play.main'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_asset_literal_extension', function(this: Blockly.Block) {
    const field = this.getField('VALUE');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioTrimmedLiteralValidator('gold#vault.main'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_name_literal_extension', function(this: Blockly.Block) {
    const field = this.getField('VALUE');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioIdentifierValidator('reward'));
      field.setSpellcheck(false);
    }
  });

  Blockly.Extensions.register('studio_json_key_extension', function(this: Blockly.Block) {
    const field = this.getField('KEY');
    if (field instanceof Blockly.FieldTextInput) {
      field.setValidator(studioIdentifierValidator('status'));
      field.setSpellcheck(false);
    }
  });

  Blockly.defineBlocksWithJsonArray([
    {
      type: ROOT_BLOCK_TYPE,
      message0: 'state %1',
      args0: [{ type: 'input_statement', name: 'STATE', check: STUDIO_STATE_CHECK }],
      message1: 'entrypoints %1',
      args1: [{ type: 'input_statement', name: 'ENTRYPOINTS', check: STUDIO_ENTRYPOINT_CHECK }],
      message2: 'triggers %1',
      args2: [{ type: 'input_statement', name: 'TRIGGERS', check: STUDIO_TRIGGER_CHECK }],
      colour: '#c74b2a',
      tooltip: 'The root organizer for your contract.',
      helpUrl: '',
    },
    {
      type: 'studio_state',
      message0: 'state %1 as %2 default %3',
      args0: [
        { type: 'field_input', name: 'NAME', text: 'counter' },
        {
          type: 'field_dropdown',
          name: 'KIND',
          options: [
            ['int', 'int'],
            ['bool', 'bool'],
            ['Json', 'Json'],
            ['Blob', 'Blob'],
          ],
        },
        { type: 'input_value', name: 'DEFAULT', check: STUDIO_STATE_DEFAULT_CHECKS },
      ],
      previousStatement: STUDIO_STATE_CHECK,
      nextStatement: STUDIO_STATE_CHECK,
      colour: '#a86a2b',
      tooltip: 'Create a durable state field.',
      helpUrl: '',
      extensions: ['studio_state_identifier_extension'],
    },
    {
      type: 'studio_entrypoint',
      message0: '%1 entrypoint %2 permission %3',
      args0: [
        {
          type: 'field_dropdown',
          name: 'KIND',
          options: [
            ['public', 'kotoage'],
            ['start', 'hajimari'],
            ['view', 'view'],
          ],
        },
        { type: 'field_input', name: 'NAME', text: 'celebrate' },
        { type: 'field_input', name: 'PERMISSION', text: 'Builder' },
      ],
      message1: 'steps %1',
      args1: [{ type: 'input_statement', name: 'BODY', check: STUDIO_ACTION_CHECK }],
      previousStatement: STUDIO_ENTRYPOINT_CHECK,
      nextStatement: STUDIO_ENTRYPOINT_CHECK,
      colour: '#4f6b8a',
      tooltip: 'Create a callable action.',
      helpUrl: '',
      extensions: ['studio_entrypoint_identifier_extension', 'studio_entrypoint_permission_extension'],
    },
    {
      type: 'studio_action_info',
      message0: 'say %1',
      args0: [{ type: 'input_value', name: 'MESSAGE', check: STUDIO_INFO_VALUE_CHECKS }],
      previousStatement: STUDIO_ACTION_CHECK,
      nextStatement: STUDIO_ACTION_CHECK,
      colour: '#c15b3f',
      tooltip: 'Emit a friendly message.',
      helpUrl: '',
    },
    {
      type: 'studio_action_transfer_asset',
      message0: 'transfer %1 of asset %2 from %3 to %4',
      args0: [
        { type: 'input_value', name: 'AMOUNT', check: 'Number' },
        { type: 'input_value', name: 'ASSET', check: STUDIO_ASSET_CHECK },
        { type: 'input_value', name: 'FROM', check: STUDIO_ACCOUNT_CHECK },
        { type: 'input_value', name: 'TO', check: STUDIO_ACCOUNT_CHECK },
      ],
      previousStatement: STUDIO_ACTION_CHECK,
      nextStatement: STUDIO_ACTION_CHECK,
      colour: '#c15b3f',
      tooltip: 'Move an asset between accounts.',
      helpUrl: '',
    },
    {
      type: 'studio_action_set_detail',
      message0: 'set detail %1 on %2 to %3',
      args0: [
        { type: 'input_value', name: 'KEY', check: STUDIO_NAME_CHECK },
        { type: 'input_value', name: 'ACCOUNT', check: STUDIO_ACCOUNT_CHECK },
        { type: 'input_value', name: 'VALUE', check: STUDIO_DETAIL_VALUE_CHECKS },
      ],
      previousStatement: STUDIO_ACTION_CHECK,
      nextStatement: STUDIO_ACTION_CHECK,
      colour: '#c15b3f',
      tooltip: 'Write account detail data.',
      helpUrl: '',
    },
    {
      type: 'studio_action_execute_query',
      message0: 'query %1 and save as %2',
      args0: [
        { type: 'input_value', name: 'QUERY', check: ['String', STUDIO_JSON_CHECK] },
        { type: 'field_input', name: 'ALIAS', text: 'result' },
      ],
      previousStatement: STUDIO_ACTION_CHECK,
      nextStatement: STUDIO_ACTION_CHECK,
      colour: '#b9913d',
      tooltip: 'Run an on-chain query.',
      helpUrl: '',
      extensions: ['studio_query_alias_extension'],
    },
    {
      type: 'studio_logic_if',
      message0: 'if %1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      message1: 'then %1',
      args1: [{ type: 'input_statement', name: 'THEN', check: STUDIO_ACTION_CHECK }],
      message2: 'else %1',
      args2: [{ type: 'input_statement', name: 'ELSE', check: STUDIO_ACTION_CHECK }],
      previousStatement: STUDIO_ACTION_CHECK,
      nextStatement: STUDIO_ACTION_CHECK,
      colour: '#7a6244',
      tooltip: 'Choose between two paths.',
      helpUrl: '',
    },
    {
      type: 'studio_logic_repeat',
      message0: 'repeat %1 times',
      args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }],
      message1: 'do %1',
      args1: [{ type: 'input_statement', name: 'DO', check: STUDIO_ACTION_CHECK }],
      previousStatement: STUDIO_ACTION_CHECK,
      nextStatement: STUDIO_ACTION_CHECK,
      colour: '#7a6244',
      tooltip: 'Repeat a playful action.',
      helpUrl: '',
    },
    {
      type: 'studio_compare',
      message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'LEFT', check: STUDIO_COMPARABLE_CHECKS },
        {
          type: 'field_dropdown',
          name: 'OP',
          options: [
            ['=', '=='],
            ['≠', '!='],
            ['<', '<'],
            ['>', '>'],
            ['≤', '<='],
            ['≥', '>='],
          ],
        },
        { type: 'input_value', name: 'RIGHT', check: STUDIO_COMPARABLE_CHECKS },
      ],
      output: 'Boolean',
      colour: '#47657d',
      tooltip: 'Compare two values.',
      helpUrl: '',
    },
    {
      type: 'studio_text',
      message0: 'text %1',
      args0: [{ type: 'field_input', name: 'VALUE', text: 'hello world' }],
      output: 'String',
      colour: '#415c72',
      tooltip: 'A text value.',
      helpUrl: '',
    },
    {
      type: 'studio_number',
      message0: 'number %1',
      args0: [{ type: 'field_number', name: 'VALUE', value: 1 }],
      output: 'Number',
      colour: '#415c72',
      tooltip: 'A number value.',
      helpUrl: '',
    },
    {
      type: 'studio_boolean',
      message0: '%1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'VALUE',
          options: [
            ['true', 'true'],
            ['false', 'false'],
          ],
        },
      ],
      output: 'Boolean',
      colour: '#415c72',
      tooltip: 'A yes or no value.',
      helpUrl: '',
    },
    {
      type: 'studio_account',
      message0: 'account %1',
      args0: [{ type: 'field_input', name: 'VALUE', text: 'alice@play.main' }],
      output: STUDIO_ACCOUNT_CHECK,
      colour: '#415c72',
      tooltip: 'An account literal.',
      helpUrl: '',
      extensions: ['studio_account_literal_extension'],
    },
    {
      type: 'studio_asset',
      message0: 'asset %1',
      args0: [{ type: 'field_input', name: 'VALUE', text: 'gold#vault.main' }],
      output: STUDIO_ASSET_CHECK,
      colour: '#415c72',
      tooltip: 'An asset definition literal.',
      helpUrl: '',
      extensions: ['studio_asset_literal_extension'],
    },
    {
      type: 'studio_name',
      message0: 'name %1',
      args0: [{ type: 'field_input', name: 'VALUE', text: 'reward' }],
      output: STUDIO_NAME_CHECK,
      colour: '#415c72',
      tooltip: 'A Name pointer literal.',
      helpUrl: '',
      extensions: ['studio_name_literal_extension'],
    },
    {
      type: 'studio_json',
      message0: 'json key %1 value %2',
      args0: [
        { type: 'field_input', name: 'KEY', text: 'status' },
        { type: 'input_value', name: 'VALUE', check: STUDIO_DETAIL_VALUE_CHECKS },
      ],
      output: STUDIO_JSON_CHECK,
      colour: '#415c72',
      tooltip: 'A small json object.',
      helpUrl: '',
      extensions: ['studio_json_key_extension'],
    },
  ]);

  Blockly.Blocks['studio_trigger'] = {
    init() {
      this.appendDummyInput()
        .appendField('trigger')
        .appendField(new Blockly.FieldTextInput('sparkle', studioIdentifierValidator('sparkle')), 'ID')
        .appendField('calls')
        .appendField(createStudioReferenceDropdown(collectStudioPublicEntrypointNames, 'No public entrypoint yet'), 'ENTRYPOINT')
        .appendField('on')
        .appendField(new Blockly.FieldDropdown([
          ['pre-commit', 'pre_commit'],
          ['manual', 'manual'],
          ['schedule', 'schedule'],
        ]), 'MODE');
      this.appendValueInput('PERIOD')
        .setCheck('Number')
        .appendField('every ms');
      this.appendValueInput('START')
        .setCheck('Number')
        .appendField('starting at');
      this.setPreviousStatement(true, STUDIO_TRIGGER_CHECK);
      this.setNextStatement(true, STUDIO_TRIGGER_CHECK);
      this.setStyle('trigger_blocks');
      this.setTooltip('Wake the contract at the right time.');
      this.setHelpUrl('');
    },
  };

  Blockly.Blocks['studio_action_set_state'] = {
    init() {
      this.appendValueInput('VALUE')
        .setCheck(STUDIO_STATE_DEFAULT_CHECKS)
        .appendField('set state')
        .appendField(createStudioReferenceDropdown(collectStudioStateNames, 'No state field yet'), 'STATE_NAME')
        .appendField('to');
      this.setPreviousStatement(true, STUDIO_ACTION_CHECK);
      this.setNextStatement(true, STUDIO_ACTION_CHECK);
      this.setStyle('action_blocks');
      this.setTooltip('Change a state value.');
      this.setHelpUrl('');
    },
  };

  Blockly.Blocks['studio_action_call_entrypoint'] = {
    init() {
      this.appendDummyInput()
        .appendField('call entrypoint')
        .appendField(createStudioReferenceDropdown(collectStudioPublicEntrypointNames, 'No public entrypoint yet'), 'ENTRYPOINT');
      this.setPreviousStatement(true, STUDIO_ACTION_CHECK);
      this.setNextStatement(true, STUDIO_ACTION_CHECK);
      this.setStyle('action_blocks');
      this.setTooltip('Call another contract entrypoint.');
      this.setHelpUrl('');
    },
  };

  Blockly.Blocks['studio_state_reference'] = {
    init() {
      this.appendDummyInput()
        .appendField('state')
        .appendField(createStudioReferenceDropdown(collectStudioStateNames, 'No state field yet'), 'STATE_NAME');
      this.setOutput(true, STUDIO_STATE_VALUE_CHECK);
      this.setStyle('value_blocks');
      this.setTooltip('Read a state value.');
      this.setHelpUrl('');
    },
  };

  studioBlocklyTheme = Blockly.Theme.defineTheme(STUDIO_THEME_NAME, {
    name: STUDIO_THEME_NAME,
    base: Blockly.Themes.Zelos,
    blockStyles: {
      state_blocks: { colourPrimary: '#a86a2b' },
      entrypoint_blocks: { colourPrimary: '#4f6b8a' },
      trigger_blocks: { colourPrimary: '#6d8451' },
      action_blocks: { colourPrimary: '#c15b3f' },
      logic_blocks: { colourPrimary: '#7a6244' },
      value_blocks: { colourPrimary: '#415c72' },
    },
    categoryStyles: {
      state_category: { colour: '#a86a2b' },
      entrypoint_category: { colour: '#4f6b8a' },
      trigger_category: { colour: '#6d8451' },
      action_category: { colour: '#c15b3f' },
      logic_category: { colour: '#7a6244' },
      value_category: { colour: '#415c72' },
    },
    componentStyles: {
      workspaceBackgroundColour: '#f5ecdb',
      toolboxBackgroundColour: '#efe0c4',
      toolboxForegroundColour: '#40281d',
      flyoutBackgroundColour: '#f7efe0',
      flyoutForegroundColour: '#40281d',
      flyoutOpacity: 0.96,
      scrollbarColour: '#a86a2b',
      insertionMarkerColour: '#c74b2a',
      insertionMarkerOpacity: 0.35,
      markerColour: '#40281d',
      cursorColour: '#40281d',
    },
    fontStyle: {
      family: 'var(--app-font-family, "Sora")',
      weight: '500',
      size: 12,
    },
  });
}

STUDIO_GENERATOR.forBlock[ROOT_BLOCK_TYPE] = (block) => {
  const stateSection = statementOrEmpty(block, 'STATE');
  const entrypointSection = statementOrEmpty(block, 'ENTRYPOINTS');
  const triggerSection = statementOrEmpty(block, 'TRIGGERS');

  return [stateSection, entrypointSection, triggerSection].filter((section) => section.length > 0).join('\n\n');
};

STUDIO_GENERATOR.forBlock['studio_state'] = (block) => {
  const kind = blockField(block, 'KIND', 'int');
  const name = blockField(block, 'NAME', 'counter');
  const fallback = kind === 'bool' ? 'false' : kind === 'Json' ? 'json!{ ready: true }' : kind === 'Blob' ? 'blob!("sparkles")' : '0';
  const initialValue = valueOrFallback(block, 'DEFAULT', fallback);
  return `  state ${kind} ${name};\n  // default ${name} = ${initialValue}\n`;
};

STUDIO_GENERATOR.forBlock['studio_entrypoint'] = (block) => {
  const kind = blockField(block, 'KIND', 'kotoage');
  const name = blockField(block, 'NAME', 'celebrate');
  const permission = blockField(block, 'PERMISSION');
  const body = statementOrEmpty(block, 'BODY') || '    info("A cheerful rule is ready.");';
  const header = kind === 'hajimari'
    ? '  hajimari()'
    : kind === 'view'
      ? `  fn ${name}()`
      : permission.length > 0
        ? `  kotoage fn ${name}() permission(${permission})`
        : `  kotoage fn ${name}()`;

  return `${header} {\n${body}\n  }\n`;
};

STUDIO_GENERATOR.forBlock['studio_trigger'] = (block) => {
  const id = blockField(block, 'ID', 'sparkle');
  const entrypoint = blockField(block, 'ENTRYPOINT', 'celebrate');
  const mode = blockField(block, 'MODE', 'pre_commit');
  const period = valueOrFallback(block, 'PERIOD', '60000');
  const start = valueOrFallback(block, 'START', '0');

  const onClause = mode === 'schedule'
    ? `    on time schedule(${start}, ${period});`
    : mode === 'manual'
      ? `    execute trigger ${id};`
      : '    on time pre_commit;';

  return `  register_trigger ${id} {\n    call ${entrypoint};\n${onClause}\n  }\n`;
};

STUDIO_GENERATOR.forBlock['studio_action_info'] = (block) => {
  const message = valueOrFallback(block, 'MESSAGE', quoted('Hello from Kotodama Studio'));
  return `    info(${message});\n`;
};

STUDIO_GENERATOR.forBlock['studio_action_transfer_asset'] = (block) => {
  const amount = valueOrFallback(block, 'AMOUNT', '1');
  const asset = valueOrFallback(block, 'ASSET', 'asset_definition!("gold#vault.main")');
  const from = valueOrFallback(block, 'FROM', 'account!("alice@play.main")');
  const to = valueOrFallback(block, 'TO', 'account!("bob@play.main")');

  return `    transfer_asset(${from}, ${to}, ${asset}, ${amount});\n`;
};

STUDIO_GENERATOR.forBlock['studio_action_set_detail'] = (block) => {
  const key = valueOrFallback(block, 'KEY', 'name!("reward")');
  const account = valueOrFallback(block, 'ACCOUNT', 'authority()');
  const value = valueOrFallback(block, 'VALUE', 'json!{ status: "ok" }');

  return `    set_account_detail(${account}, ${key}, ${value});\n`;
};

STUDIO_GENERATOR.forBlock['studio_action_set_state'] = (block) => {
  const stateName = blockField(block, 'STATE_NAME', 'counter');
  const value = valueOrFallback(block, 'VALUE', '0');
  return `    ${stateName} = ${value};\n`;
};

STUDIO_GENERATOR.forBlock['studio_action_execute_query'] = (block) => {
  const alias = blockField(block, 'ALIAS', 'result');
  const query = valueOrFallback(block, 'QUERY', quoted('FindAccounts'));
  return `    let ${alias} = execute_query(norito_bytes(${query}));\n`;
};

STUDIO_GENERATOR.forBlock['studio_action_call_entrypoint'] = (block) => {
  const entrypoint = blockField(block, 'ENTRYPOINT', 'celebrate');
  return `    call ${entrypoint}();\n`;
};

STUDIO_GENERATOR.forBlock['studio_logic_if'] = (block) => {
  const condition = valueOrFallback(block, 'CONDITION', 'true');
  const thenBranch = statementOrEmpty(block, 'THEN') || '      info("Then branch");';
  const elseBranch = statementOrEmpty(block, 'ELSE') || '      info("Else branch");';

  return `    if (${condition}) {\n${thenBranch}\n    } else {\n${elseBranch}\n    }\n`;
};

STUDIO_GENERATOR.forBlock['studio_logic_repeat'] = (block) => {
  const times = valueOrFallback(block, 'TIMES', '3');
  const body = statementOrEmpty(block, 'DO') || '      info("Looping");';
  return `    for (let i = 0; i < ${times}; i = i + 1) {\n${body}\n    }\n`;
};

STUDIO_GENERATOR.forBlock['studio_compare'] = (block) => {
  const left = valueOrFallback(block, 'LEFT', '0');
  const right = valueOrFallback(block, 'RIGHT', '0');
  const operator = blockField(block, 'OP', '==');
  return [`${left} ${operator} ${right}`, 0];
};

STUDIO_GENERATOR.forBlock['studio_text'] = (block) => [quoted(blockField(block, 'VALUE', 'hello world')), 0];
STUDIO_GENERATOR.forBlock['studio_number'] = (block) => [blockField(block, 'VALUE', '1'), 0];
STUDIO_GENERATOR.forBlock['studio_boolean'] = (block) => [blockField(block, 'VALUE', 'true'), 0];
STUDIO_GENERATOR.forBlock['studio_account'] = (block) => [ `account!(${quoted(blockField(block, 'VALUE', 'alice@play.main'))})`, 0];
STUDIO_GENERATOR.forBlock['studio_asset'] = (block) => [ `asset_definition!(${quoted(blockField(block, 'VALUE', 'gold#vault.main'))})`, 0];
STUDIO_GENERATOR.forBlock['studio_name'] = (block) => [ `name!(${quoted(blockField(block, 'VALUE', 'reward'))})`, 0];
STUDIO_GENERATOR.forBlock['studio_json'] = (block) => {
  const key = blockField(block, 'KEY', 'status');
  const value = valueOrFallback(block, 'VALUE', quoted('ok'));
  return [`json!{ ${key}: ${value} }`, 0];
};
STUDIO_GENERATOR.forBlock['studio_state_reference'] = (block) => [blockField(block, 'STATE_NAME', 'counter'), 0];

function ensureRootBlock(workspace: Blockly.Workspace) {
  const root = workspace.getBlocksByType(ROOT_BLOCK_TYPE, false)[0];
  if (!root) return;
  root.setDeletable(false);
  root.setMovable(false);
  root.setEditable(false);
}

function templateXml(templateId: StudioTemplateId): string {
  switch (templateId) {
    case 'watchdog':
      return `
        <xml xmlns="https://developers.google.com/blockly/xml">
          <block type="${ROOT_BLOCK_TYPE}" x="24" y="24">
            <statement name="STATE">
              <block type="studio_state">
                <field name="NAME">alerts</field>
                <field name="KIND">int</field>
                <value name="DEFAULT">
                  <shadow type="studio_number"><field name="VALUE">0</field></shadow>
                </value>
              </block>
            </statement>
            <statement name="ENTRYPOINTS">
              <block type="studio_entrypoint">
                <field name="KIND">kotoage</field>
                <field name="NAME">watch</field>
                <field name="PERMISSION">Watcher</field>
                <statement name="BODY">
                  <block type="studio_logic_if">
                    <value name="CONDITION">
                      <block type="studio_compare">
                        <value name="LEFT">
                          <block type="studio_state_reference"><field name="STATE_NAME">alerts</field></block>
                        </value>
                        <field name="OP">&gt;</field>
                        <value name="RIGHT">
                          <shadow type="studio_number"><field name="VALUE">2</field></shadow>
                        </value>
                      </block>
                    </value>
                    <statement name="THEN">
                      <block type="studio_action_info">
                        <value name="MESSAGE">
                          <shadow type="studio_text"><field name="VALUE">Time to help!</field></shadow>
                        </value>
                      </block>
                    </statement>
                    <statement name="ELSE">
                      <block type="studio_action_info">
                        <value name="MESSAGE">
                          <shadow type="studio_text"><field name="VALUE">Everything feels calm.</field></shadow>
                        </value>
                      </block>
                    </statement>
                  </block>
                </statement>
              </block>
            </statement>
            <statement name="TRIGGERS">
              <block type="studio_trigger">
                <field name="ID">heartbeat</field>
                <field name="ENTRYPOINT">watch</field>
                <field name="MODE">pre_commit</field>
              </block>
            </statement>
          </block>
        </xml>
      `;
    case 'subscription':
      return `
        <xml xmlns="https://developers.google.com/blockly/xml">
          <block type="${ROOT_BLOCK_TYPE}" x="24" y="24">
            <statement name="STATE">
              <block type="studio_state">
                <field name="NAME">renewals</field>
                <field name="KIND">int</field>
                <value name="DEFAULT">
                  <shadow type="studio_number"><field name="VALUE">1</field></shadow>
                </value>
              </block>
            </statement>
            <statement name="ENTRYPOINTS">
              <block type="studio_entrypoint">
                <field name="KIND">kotoage</field>
                <field name="NAME">bill</field>
                <field name="PERMISSION">Billing</field>
                <statement name="BODY">
                  <block type="studio_action_transfer_asset">
                    <value name="AMOUNT">
                      <shadow type="studio_number"><field name="VALUE">10</field></shadow>
                    </value>
                    <value name="ASSET">
                      <shadow type="studio_asset"><field name="VALUE">usd#issuer.main</field></shadow>
                    </value>
                    <value name="FROM">
                      <shadow type="studio_account"><field name="VALUE">customer@stream.main</field></shadow>
                    </value>
                    <value name="TO">
                      <shadow type="studio_account"><field name="VALUE">treasury@stream.main</field></shadow>
                    </value>
                    <next>
                      <block type="studio_action_set_state">
                        <field name="STATE_NAME">renewals</field>
                        <value name="VALUE">
                          <shadow type="studio_number"><field name="VALUE">2</field></shadow>
                        </value>
                      </block>
                    </next>
                  </block>
                </statement>
              </block>
            </statement>
            <statement name="TRIGGERS">
              <block type="studio_trigger">
                <field name="ID">bill_monthly</field>
                <field name="ENTRYPOINT">bill</field>
                <field name="MODE">schedule</field>
                <value name="PERIOD">
                  <shadow type="studio_number"><field name="VALUE">2592000000</field></shadow>
                </value>
                <value name="START">
                  <shadow type="studio_number"><field name="VALUE">0</field></shadow>
                </value>
              </block>
            </statement>
          </block>
        </xml>
      `;
    case 'reward':
    default:
      return `
        <xml xmlns="https://developers.google.com/blockly/xml">
          <block type="${ROOT_BLOCK_TYPE}" x="24" y="24">
            <statement name="STATE">
              <block type="studio_state">
                <field name="NAME">points</field>
                <field name="KIND">int</field>
                <value name="DEFAULT">
                  <shadow type="studio_number"><field name="VALUE">0</field></shadow>
                </value>
              </block>
            </statement>
            <statement name="ENTRYPOINTS">
              <block type="studio_entrypoint">
                <field name="KIND">kotoage</field>
                <field name="NAME">celebrate</field>
                <field name="PERMISSION">Builder</field>
                <statement name="BODY">
                  <block type="studio_action_info">
                    <value name="MESSAGE">
                      <shadow type="studio_text"><field name="VALUE">Confetti time!</field></shadow>
                    </value>
                    <next>
                      <block type="studio_action_set_detail">
                        <value name="KEY">
                          <shadow type="studio_name"><field name="VALUE">mood</field></shadow>
                        </value>
                        <value name="ACCOUNT">
                          <shadow type="studio_account"><field name="VALUE">friend@party.main</field></shadow>
                        </value>
                        <value name="VALUE">
                          <shadow type="studio_json">
                            <field name="KEY">status</field>
                            <value name="VALUE">
                              <shadow type="studio_text"><field name="VALUE">winner</field></shadow>
                            </value>
                          </shadow>
                        </value>
                        <next>
                          <block type="studio_action_transfer_asset">
                            <value name="AMOUNT">
                              <shadow type="studio_number"><field name="VALUE">5</field></shadow>
                            </value>
                            <value name="ASSET">
                              <shadow type="studio_asset"><field name="VALUE">stars#party.main</field></shadow>
                            </value>
                            <value name="FROM">
                              <shadow type="studio_account"><field name="VALUE">treasury@party.main</field></shadow>
                            </value>
                            <value name="TO">
                              <shadow type="studio_account"><field name="VALUE">friend@party.main</field></shadow>
                            </value>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </statement>
              </block>
            </statement>
            <statement name="TRIGGERS">
              <block type="studio_trigger">
                <field name="ID">sparkle</field>
                <field name="ENTRYPOINT">celebrate</field>
                <field name="MODE">pre_commit</field>
              </block>
            </statement>
          </block>
        </xml>
      `;
  }
}

function blockItem(type: string): StudioToolboxBlockItem {
  return { kind: 'block', type };
}

function category(name: string, categorystyle: string, contents: StudioToolboxBlockItem[]): StudioToolboxCategory {
  return {
    kind: 'category',
    name,
    categorystyle,
    contents,
  };
}

function baseToolbox(): StudioToolboxInfo {
  return {
    kind: 'categoryToolbox',
    contents: [
      category('State', 'state_category', [blockItem('studio_state')]),
      category('Entrypoints', 'entrypoint_category', [blockItem('studio_entrypoint')]),
      category('Triggers', 'trigger_category', [blockItem('studio_trigger')]),
      category('Actions', 'action_category', [
        blockItem('studio_action_info'),
        blockItem('studio_action_transfer_asset'),
        blockItem('studio_action_set_detail'),
        blockItem('studio_action_set_state'),
      ]),
      category('Logic', 'logic_category', [
        blockItem('studio_logic_if'),
        blockItem('studio_logic_repeat'),
        blockItem('studio_compare'),
      ]),
      category('Values', 'value_category', [
        blockItem('studio_text'),
        blockItem('studio_number'),
        blockItem('studio_boolean'),
        blockItem('studio_account'),
        blockItem('studio_asset'),
        blockItem('studio_name'),
        blockItem('studio_json'),
        blockItem('studio_state_reference'),
      ]),
    ],
  };
}

export function ensureStudioBlocklyRegistered() {
  if (registered) return;
  registerBlocks();
  registered = true;
}

export function studioTheme() {
  ensureStudioBlocklyRegistered();
  return studioBlocklyTheme ?? Blockly.Themes.Zelos;
}

export function createStudioToolbox(mode: StudioToolboxMode) {
  ensureStudioBlocklyRegistered();
  const toolbox = baseToolbox();

  if (mode === 'advanced') {
    const actionsCategory = toolbox.contents.find(
      (item): item is StudioToolboxCategory => item.kind === 'category' && item.name === 'Actions'
    );

    if (actionsCategory) {
      actionsCategory.contents.push(blockItem('studio_action_execute_query'));
      actionsCategory.contents.push(blockItem('studio_action_call_entrypoint'));
    }
  }

  return toolbox;
}

export function reconcileStudioWorkspaceReferences(workspace: Blockly.Workspace): {
  correctedReferenceCount: number
  disabledBlockCount: number
} {
  ensureStudioBlocklyRegistered();

  let correctedReferenceCount = 0;
  let disabledBlockCount = 0;

  Blockly.Events.disable();
  try {
    workspace.getAllBlocks(false).forEach((block) => {
      clearStudioReferenceValidation(block);
    });

    const publicEntrypoints = collectStudioPublicEntrypointNames(workspace);
    const states = collectStudioStateNames(workspace);

    for (const block of workspace.getBlocksByType('studio_trigger', false)) {
      correctedReferenceCount += reconcileStudioReferenceField(block, 'ENTRYPOINT', publicEntrypoints) ? 1 : 0;
      if (publicEntrypoints.length === 0) {
        block.setDisabledReason(true, STUDIO_INVALID_REFERENCE_REASON);
        block.setWarningText('Define a public entrypoint before adding a trigger.', STUDIO_REFERENCE_WARNING_ID);
        disabledBlockCount += 1;
      }
    }

    for (const block of workspace.getBlocksByType('studio_action_call_entrypoint', false)) {
      correctedReferenceCount += reconcileStudioReferenceField(block, 'ENTRYPOINT', publicEntrypoints) ? 1 : 0;
      if (publicEntrypoints.length === 0) {
        block.setDisabledReason(true, STUDIO_INVALID_REFERENCE_REASON);
        block.setWarningText('Define a public entrypoint before calling one.', STUDIO_REFERENCE_WARNING_ID);
        disabledBlockCount += 1;
      }
    }

    for (const block of workspace.getBlocksByType('studio_action_set_state', false)) {
      correctedReferenceCount += reconcileStudioReferenceField(block, 'STATE_NAME', states) ? 1 : 0;
      if (states.length === 0) {
        block.setDisabledReason(true, STUDIO_INVALID_REFERENCE_REASON);
        block.setWarningText('Define a state field before setting one.', STUDIO_REFERENCE_WARNING_ID);
        disabledBlockCount += 1;
      }
    }

    for (const block of workspace.getBlocksByType('studio_state_reference', false)) {
      correctedReferenceCount += reconcileStudioReferenceField(block, 'STATE_NAME', states) ? 1 : 0;
      if (states.length === 0) {
        block.setDisabledReason(true, STUDIO_INVALID_REFERENCE_REASON);
        block.setWarningText('Define a state field before reading one.', STUDIO_REFERENCE_WARNING_ID);
        const ancestor = findNearestStudioStatementAncestor(block);
        if (ancestor) {
          ancestor.setDisabledReason(true, STUDIO_INVALID_REFERENCE_DEPENDENCY_REASON);
          ancestor.setWarningText('This block depends on a missing state field.', STUDIO_REFERENCE_DEPENDENCY_WARNING_ID);
        }
        disabledBlockCount += 1;
      }
    }
  } finally {
    Blockly.Events.enable();
  }

  return {
    correctedReferenceCount,
    disabledBlockCount,
  };
}

export function loadStudioTemplate(workspace: Blockly.Workspace, templateId: StudioTemplateId) {
  ensureStudioBlocklyRegistered();
  const xml = Blockly.utils.xml.textToDom(templateXml(templateId));
  workspace.clear();
  Blockly.Xml.domToWorkspace(xml, workspace);
  ensureRootBlock(workspace);
}

export function loadStudioWorkspaceState(
  workspace: Blockly.Workspace,
  state: Record<string, unknown> | null,
  templateId: StudioTemplateId
) {
  ensureStudioBlocklyRegistered();

  if (state) {
    workspace.clear();
    Blockly.serialization.workspaces.load(state, workspace);
    ensureRootBlock(workspace);
    return;
  }

  loadStudioTemplate(workspace, templateId);
}

export function saveStudioWorkspaceState(workspace: Blockly.Workspace) {
  return Blockly.serialization.workspaces.save(workspace) as Record<string, unknown>;
}

export function buildStudioSections(workspace: Blockly.Workspace): StudioSections {
  ensureStudioBlocklyRegistered();
  const root = workspace.getBlocksByType(ROOT_BLOCK_TYPE, false)[0];
  if (!root) {
    return {
      stateSection: '',
      entrypointSection: '',
      triggerSection: '',
    };
  }

  const stateSection = statementOrEmpty(root, 'STATE');
  const entrypointSection = statementOrEmpty(root, 'ENTRYPOINTS');
  const triggerSection = statementOrEmpty(root, 'TRIGGERS');

  return { stateSection, entrypointSection, triggerSection };
}

export function validateStudioWorkspace(workspace: Blockly.Workspace): StudioWorkspaceIssue[] {
  ensureStudioBlocklyRegistered();

  const issues: StudioWorkspaceIssue[] = [];
  const duplicateStates = collectStudioDuplicateValues(collectStudioFieldValues(workspace, 'studio_state', 'NAME', 'counter'));
  const duplicateEntrypoints = collectStudioDuplicateValues(collectStudioFieldValues(workspace, 'studio_entrypoint', 'NAME', 'celebrate'));
  const duplicateTriggers = collectStudioDuplicateValues(collectStudioFieldValues(workspace, 'studio_trigger', 'ID', 'sparkle'));

  for (const name of duplicateStates) {
    issues.push({
      code: 'duplicate_state',
      severity: 'error',
      message: `State \`${name}\` is defined more than once.`,
    });
  }

  for (const name of duplicateEntrypoints) {
    issues.push({
      code: 'duplicate_entrypoint',
      severity: 'error',
      message: `Entrypoint \`${name}\` is defined more than once.`,
    });
  }

  for (const id of duplicateTriggers) {
    issues.push({
      code: 'duplicate_trigger',
      severity: 'error',
      message: `Trigger \`${id}\` is registered more than once.`,
    });
  }

  for (const literal of collectStudioFieldValues(workspace, 'studio_account', 'VALUE', 'alice@play.main')) {
    if (hasStudioAccountLiteralShape(literal)) continue;
    issues.push({
      code: 'invalid_account_literal',
      severity: 'error',
      message: `Account literal \`${literal}\` should look like \`name@domain\`.`,
    });
  }

  for (const literal of collectStudioFieldValues(workspace, 'studio_asset', 'VALUE', 'gold#vault.main')) {
    if (hasStudioAssetLiteralShape(literal)) continue;
    issues.push({
      code: 'invalid_asset_literal',
      severity: 'error',
      message: `Asset literal \`${literal}\` should look like \`asset#domain\`.`,
    });
  }

  const rawQueryBlocks = workspace.getBlocksByType('studio_action_execute_query', false).filter(isStudioBlockAvailable);
  if (rawQueryBlocks.length > 0) {
    issues.push({
      code: 'raw_query_payload',
      severity: 'warning',
      message: 'Advanced query blocks still emit raw query payloads. Review them before compile.',
    });
  }

  return issues;
}

export function summarizeStudioWorkspace(workspace: Blockly.Workspace): KotodamaStudioWorkspaceSummary {
  ensureStudioBlocklyRegistered();

  const states = collectStudioStateNames(workspace);

  const entrypoints = workspace
    .getBlocksByType('studio_entrypoint', false)
    .filter(isStudioBlockAvailable)
    .map((block) => ({
      name: blockField(block, 'NAME', 'celebrate'),
      kind: blockField(block, 'KIND', 'kotoage') as KotodamaStudioWorkspaceSummary['entrypoints'][number]['kind'],
      permission: blockField(block, 'PERMISSION') || null,
    }));

  const triggers = workspace
    .getBlocksByType('studio_trigger', false)
    .filter(isStudioBlockAvailable)
    .map((block) => ({
      id: blockField(block, 'ID', 'sparkle'),
      entrypoint: blockField(block, 'ENTRYPOINT', 'celebrate'),
      mode: blockField(block, 'MODE', 'pre_commit') as KotodamaStudioWorkspaceSummary['triggers'][number]['mode'],
    }));

  return { states, entrypoints, triggers };
}
