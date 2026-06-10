import * as Blockly from 'blockly';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildStudioSections,
  createStudioToolbox,
  ensureStudioBlocklyRegistered,
  loadStudioWorkspaceState,
  reconcileStudioWorkspaceReferences,
  saveStudioWorkspaceState,
  summarizeStudioWorkspace,
  validateStudioWorkspace,
} from './blockly';

function canConnect(
  workspace: Blockly.Workspace,
  inputConnection: Blockly.Connection | null | undefined,
  otherConnection: Blockly.Connection | null | undefined
) {
  return workspace.connectionChecker.canConnect(inputConnection ?? null, otherConnection ?? null, false);
}

describe('studio blockly helpers', () => {
  beforeEach(() => {
    ensureStudioBlocklyRegistered();
  });

  it('loads the reward template into sections and summary', () => {
    const workspace = new Blockly.Workspace();

    loadStudioWorkspaceState(workspace, null, 'reward');

    const sections = buildStudioSections(workspace);
    const summary = summarizeStudioWorkspace(workspace);

    expect(summary.states).toContain('points');
    expect(summary.entrypoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'celebrate',
          kind: 'kotoage',
        }),
      ])
    );
    expect(summary.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sparkle',
          entrypoint: 'celebrate',
          mode: 'pre_commit',
        }),
      ])
    );
    expect(sections.entrypointSection).toContain('kotoage fn celebrate()');

    workspace.dispose();
  });

  it('round-trips a saved workspace state into a new workspace', () => {
    const sourceWorkspace = new Blockly.Workspace();
    loadStudioWorkspaceState(sourceWorkspace, null, 'subscription');

    const savedState = saveStudioWorkspaceState(sourceWorkspace);

    const nextWorkspace = new Blockly.Workspace();
    loadStudioWorkspaceState(nextWorkspace, savedState, 'reward');

    const summary = summarizeStudioWorkspace(nextWorkspace);

    expect(summary.entrypoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'bill',
          kind: 'kotoage',
        }),
      ])
    );
    expect(summary.triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'bill_monthly',
          mode: 'schedule',
        }),
      ])
    );

    sourceWorkspace.dispose();
    nextWorkspace.dispose();
  });

  it('restricts statement sockets to compatible contract sections and actions', () => {
    const workspace = new Blockly.Workspace();
    const root = workspace.newBlock('studio_contract_root');
    const state = workspace.newBlock('studio_state');
    const entrypoint = workspace.newBlock('studio_entrypoint');
    const trigger = workspace.newBlock('studio_trigger');
    const action = workspace.newBlock('studio_action_info');

    expect(canConnect(workspace, root.getInput('STATE')?.connection, state.previousConnection)).toBe(true);
    expect(canConnect(workspace, root.getInput('STATE')?.connection, action.previousConnection)).toBe(false);
    expect(canConnect(workspace, root.getInput('ENTRYPOINTS')?.connection, entrypoint.previousConnection)).toBe(true);
    expect(canConnect(workspace, root.getInput('TRIGGERS')?.connection, trigger.previousConnection)).toBe(true);
    expect(canConnect(workspace, entrypoint.getInput('BODY')?.connection, action.previousConnection)).toBe(true);
    expect(canConnect(workspace, entrypoint.getInput('BODY')?.connection, trigger.previousConnection)).toBe(false);

    root.dispose();
    state.dispose();
    entrypoint.dispose();
    trigger.dispose();
    action.dispose();
    workspace.dispose();
  });

  it('restricts value sockets so only compatible reporter blocks fit together', () => {
    const workspace = new Blockly.Workspace();
    const transfer = workspace.newBlock('studio_action_transfer_asset');
    const repeat = workspace.newBlock('studio_logic_repeat');
    const compare = workspace.newBlock('studio_compare');
    const setDetail = workspace.newBlock('studio_action_set_detail');
    const number = workspace.newBlock('studio_number');
    const text = workspace.newBlock('studio_text');
    const bool = workspace.newBlock('studio_boolean');
    const account = workspace.newBlock('studio_account');
    const asset = workspace.newBlock('studio_asset');
    const name = workspace.newBlock('studio_name');
    const json = workspace.newBlock('studio_json');
    const stateReference = workspace.newBlock('studio_state_reference');

    expect(canConnect(workspace, transfer.getInput('AMOUNT')?.connection, number.outputConnection)).toBe(true);
    expect(canConnect(workspace, transfer.getInput('AMOUNT')?.connection, text.outputConnection)).toBe(false);
    expect(canConnect(workspace, transfer.getInput('ASSET')?.connection, asset.outputConnection)).toBe(true);
    expect(canConnect(workspace, transfer.getInput('ASSET')?.connection, account.outputConnection)).toBe(false);
    expect(canConnect(workspace, transfer.getInput('FROM')?.connection, account.outputConnection)).toBe(true);
    expect(canConnect(workspace, setDetail.getInput('KEY')?.connection, name.outputConnection)).toBe(true);
    expect(canConnect(workspace, setDetail.getInput('KEY')?.connection, text.outputConnection)).toBe(false);
    expect(canConnect(workspace, setDetail.getInput('VALUE')?.connection, json.outputConnection)).toBe(true);
    expect(canConnect(workspace, setDetail.getInput('VALUE')?.connection, stateReference.outputConnection)).toBe(true);
    expect(canConnect(workspace, compare.getInput('LEFT')?.connection, bool.outputConnection)).toBe(true);
    expect(canConnect(workspace, repeat.getInput('TIMES')?.connection, number.outputConnection)).toBe(true);
    expect(canConnect(workspace, repeat.getInput('TIMES')?.connection, bool.outputConnection)).toBe(false);

    transfer.dispose();
    repeat.dispose();
    compare.dispose();
    setDetail.dispose();
    number.dispose();
    text.dispose();
    bool.dispose();
    account.dispose();
    asset.dispose();
    name.dispose();
    json.dispose();
    stateReference.dispose();
    workspace.dispose();
  });

  it('keeps the actions category populated in both toolbox modes', () => {
    const basicToolbox = createStudioToolbox('basic');
    const advancedToolbox = createStudioToolbox('advanced');
    const basicActions = basicToolbox.contents.find((item) => item.kind === 'category' && item.name === 'Actions');
    const advancedActions = advancedToolbox.contents.find((item) => item.kind === 'category' && item.name === 'Actions');

    expect(basicActions?.contents.map((item) => item.type)).toEqual([
      'studio_action_info',
      'studio_action_transfer_asset',
      'studio_action_set_detail',
      'studio_action_set_state',
    ]);
    expect(advancedActions?.contents.map((item) => item.type)).toEqual([
      'studio_action_info',
      'studio_action_transfer_asset',
      'studio_action_set_detail',
      'studio_action_set_state',
      'studio_action_execute_query',
      'studio_action_call_entrypoint',
    ]);
  });

  it('keeps trigger and call-entrypoint blocks aligned to renamed public entrypoints', () => {
    const workspace = new Blockly.Workspace();
    loadStudioWorkspaceState(workspace, null, 'reward');

    const entrypoint = workspace.getBlocksByType('studio_entrypoint', false)[0]!;
    const trigger = workspace.getBlocksByType('studio_trigger', false)[0]!;
    const callEntrypoint = workspace.newBlock('studio_action_call_entrypoint');

    entrypoint.setFieldValue('party time', 'NAME');
    reconcileStudioWorkspaceReferences(workspace);

    expect(trigger.getFieldValue('ENTRYPOINT')).toBe('party_time');
    expect(callEntrypoint.getFieldValue('ENTRYPOINT')).toBe('party_time');
    expect(trigger.isEnabled()).toBe(true);
    expect(callEntrypoint.isEnabled()).toBe(true);

    callEntrypoint.dispose();
    workspace.dispose();
  });

  it('disables state-dependent statements when no state definitions remain', () => {
    const workspace = new Blockly.Workspace();
    loadStudioWorkspaceState(workspace, null, 'watchdog');

    const state = workspace.getBlocksByType('studio_state', false)[0]!;
    const stateReference = workspace.getBlocksByType('studio_state_reference', false)[0]!;
    const branch = workspace.getBlocksByType('studio_logic_if', false)[0]!;

    state.dispose();
    reconcileStudioWorkspaceReferences(workspace);

    expect(stateReference.getFieldValue('STATE_NAME')).toBe('__studio_missing_reference__');
    expect(stateReference.isEnabled()).toBe(false);
    expect(branch.isEnabled()).toBe(false);

    workspace.dispose();
  });

  it('sanitizes identifier-like text fields used to build source code', () => {
    const workspace = new Blockly.Workspace();
    const state = workspace.newBlock('studio_state');
    const entrypoint = workspace.newBlock('studio_entrypoint');
    const trigger = workspace.newBlock('studio_trigger');
    const query = workspace.newBlock('studio_action_execute_query');
    const name = workspace.newBlock('studio_name');
    const json = workspace.newBlock('studio_json');

    state.setFieldValue('score total', 'NAME');
    entrypoint.setFieldValue('party time', 'NAME');
    entrypoint.setFieldValue('Builder Team', 'PERMISSION');
    trigger.setFieldValue('daily spark', 'ID');
    query.setFieldValue('daily result', 'ALIAS');
    name.setFieldValue('mood score', 'VALUE');
    json.setFieldValue('status text', 'KEY');

    expect(state.getFieldValue('NAME')).toBe('score_total');
    expect(entrypoint.getFieldValue('NAME')).toBe('party_time');
    expect(entrypoint.getFieldValue('PERMISSION')).toBe('Builder_Team');
    expect(trigger.getFieldValue('ID')).toBe('daily_spark');
    expect(query.getFieldValue('ALIAS')).toBe('daily_result');
    expect(name.getFieldValue('VALUE')).toBe('mood_score');
    expect(json.getFieldValue('KEY')).toBe('status_text');

    state.dispose();
    entrypoint.dispose();
    trigger.dispose();
    query.dispose();
    name.dispose();
    json.dispose();
    workspace.dispose();
  });

  it('trims account and asset literals but reports malformed ones during validation', () => {
    const workspace = new Blockly.Workspace();
    const account = workspace.newBlock('studio_account');
    const asset = workspace.newBlock('studio_asset');

    account.setFieldValue('  invalid account  ', 'VALUE');
    asset.setFieldValue('  invalid asset  ', 'VALUE');

    expect(account.getFieldValue('VALUE')).toBe('invalid account');
    expect(asset.getFieldValue('VALUE')).toBe('invalid asset');
    expect(validateStudioWorkspace(workspace)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_account_literal', severity: 'error' }),
        expect.objectContaining({ code: 'invalid_asset_literal', severity: 'error' }),
      ])
    );

    account.dispose();
    asset.dispose();
    workspace.dispose();
  });

  it('reports duplicate definitions and raw query blocks before compile', () => {
    const workspace = new Blockly.Workspace();
    const stateA = workspace.newBlock('studio_state');
    const stateB = workspace.newBlock('studio_state');
    const entrypointA = workspace.newBlock('studio_entrypoint');
    const entrypointB = workspace.newBlock('studio_entrypoint');
    const triggerA = workspace.newBlock('studio_trigger');
    const triggerB = workspace.newBlock('studio_trigger');
    const query = workspace.newBlock('studio_action_execute_query');

    stateA.setFieldValue('points', 'NAME');
    stateB.setFieldValue('points', 'NAME');
    entrypointA.setFieldValue('celebrate', 'NAME');
    entrypointB.setFieldValue('celebrate', 'NAME');
    triggerA.setFieldValue('sparkle', 'ID');
    triggerB.setFieldValue('sparkle', 'ID');

    expect(validateStudioWorkspace(workspace)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate_state', severity: 'error' }),
        expect.objectContaining({ code: 'duplicate_entrypoint', severity: 'error' }),
        expect.objectContaining({ code: 'duplicate_trigger', severity: 'error' }),
        expect.objectContaining({ code: 'raw_query_payload', severity: 'warning' }),
      ])
    );

    stateA.dispose();
    stateB.dispose();
    entrypointA.dispose();
    entrypointB.dispose();
    triggerA.dispose();
    triggerB.dispose();
    query.dispose();
    workspace.dispose();
  });
});
