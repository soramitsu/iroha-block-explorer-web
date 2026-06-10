import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContractStudioBuilder from './ContractStudioBuilder.vue';

const blocklyMocks = vi.hoisted(() => ({
  inject: vi.fn(),
  svgResize: vi.fn(),
}));

const studioMocks = vi.hoisted(() => ({
  addChangeListener: vi.fn(),
  buildStudioSections: vi.fn(() => ({
    stateSection: '',
    entrypointSection: '',
    triggerSection: '',
  })),
  createStudioToolbox: vi.fn((mode: string) => ({
    kind: 'categoryToolbox',
    contents: [{ kind: 'category', name: mode, categorystyle: 'action_category', contents: [] }],
  })),
  dispose: vi.fn(),
  ensureStudioBlocklyRegistered: vi.fn(),
  loadStudioTemplate: vi.fn(),
  loadStudioWorkspaceState: vi.fn(),
  reconcileStudioWorkspaceReferences: vi.fn(() => ({
    correctedReferenceCount: 0,
    disabledBlockCount: 0,
  })),
  saveStudioWorkspaceState: vi.fn(() => ({ template: 'reward' })),
  selectItemByPosition: vi.fn(),
  studioTheme: vi.fn(() => ({ name: 'studio-theme' })),
  summarizeStudioWorkspace: vi.fn(() => ({
    states: [],
    entrypoints: [],
    triggers: [],
  })),
  validateStudioWorkspace: vi.fn(() => []),
  updateToolbox: vi.fn(),
}));

const mockWorkspace = {
  addChangeListener: studioMocks.addChangeListener,
  dispose: studioMocks.dispose,
  getToolbox: () => ({
    selectItemByPosition: studioMocks.selectItemByPosition,
  }),
  updateToolbox: studioMocks.updateToolbox,
};

vi.mock('blockly', () => ({
  inject: blocklyMocks.inject,
  svgResize: blocklyMocks.svgResize,
}));

vi.mock('./blockly', () => ({
  buildStudioSections: studioMocks.buildStudioSections,
  createStudioToolbox: studioMocks.createStudioToolbox,
  ensureStudioBlocklyRegistered: studioMocks.ensureStudioBlocklyRegistered,
  loadStudioTemplate: studioMocks.loadStudioTemplate,
  loadStudioWorkspaceState: studioMocks.loadStudioWorkspaceState,
  reconcileStudioWorkspaceReferences: studioMocks.reconcileStudioWorkspaceReferences,
  saveStudioWorkspaceState: studioMocks.saveStudioWorkspaceState,
  studioTheme: studioMocks.studioTheme,
  summarizeStudioWorkspace: studioMocks.summarizeStudioWorkspace,
  validateStudioWorkspace: studioMocks.validateStudioWorkspace,
}));

const resizeObservers: ResizeObserverMock[] = [];

class ResizeObserverMock {
  callback: ResizeObserverCallback;
  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    resizeObservers.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('ContractStudioBuilder', () => {
  beforeEach(() => {
    blocklyMocks.inject.mockReset();
    blocklyMocks.inject.mockReturnValue(mockWorkspace);
    blocklyMocks.svgResize.mockClear();
    resizeObservers.length = 0;
    studioMocks.addChangeListener.mockClear();
    studioMocks.buildStudioSections.mockClear();
    studioMocks.createStudioToolbox.mockClear();
    studioMocks.dispose.mockClear();
    studioMocks.ensureStudioBlocklyRegistered.mockClear();
    studioMocks.loadStudioTemplate.mockClear();
    studioMocks.loadStudioWorkspaceState.mockClear();
    studioMocks.reconcileStudioWorkspaceReferences.mockClear();
    studioMocks.saveStudioWorkspaceState.mockClear();
    studioMocks.selectItemByPosition.mockClear();
    studioMocks.studioTheme.mockClear();
    studioMocks.summarizeStudioWorkspace.mockClear();
    studioMocks.validateStudioWorkspace.mockClear();
    studioMocks.updateToolbox.mockClear();

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('resizes the Blockly workspace after mount and on observed layout changes', async () => {
    const wrapper = mount(ContractStudioBuilder, {
      props: {
        modelValue: null,
        toolboxMode: 'basic',
        templateId: 'reward',
        templateNonce: 0,
      },
    });

    await wrapper.vm.$nextTick();

    expect(blocklyMocks.inject).toHaveBeenCalledTimes(1);
    expect(blocklyMocks.svgResize).toHaveBeenCalledTimes(1);
    expect(studioMocks.reconcileStudioWorkspaceReferences).toHaveBeenCalledWith(mockWorkspace);
    expect(resizeObservers).toHaveLength(1);

    resizeObservers[0]?.trigger();

    expect(blocklyMocks.svgResize).toHaveBeenCalledTimes(2);
  });

  it('reselects the default flyout category and resizes after toolbox mode changes', async () => {
    const wrapper = mount(ContractStudioBuilder, {
      props: {
        modelValue: null,
        toolboxMode: 'basic',
        templateId: 'reward',
        templateNonce: 0,
      },
    });

    await wrapper.setProps({ toolboxMode: 'advanced' });

    expect(studioMocks.updateToolbox).toHaveBeenCalledWith({
      kind: 'categoryToolbox',
      contents: [{ kind: 'category', name: 'advanced', categorystyle: 'action_category', contents: [] }],
    });
    expect(studioMocks.selectItemByPosition).toHaveBeenCalledWith(3);
    expect(blocklyMocks.svgResize).toHaveBeenCalled();
  });
});
