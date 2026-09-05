import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import NodeSettings from './NodeSettings.vue';
import { PORTAL_ID } from '@/shared/ui/consts';
import { useNodeSettingsDropdown } from '@/shared/ui/composables/header-portal';

const { forcedState, setToriiBaseUrlSpy, resetToriiBaseUrlSpy, retryToriiFailoverSpy, successSpy, errorSpy } =
  vi.hoisted(() => ({
    forcedState: { value: false },
    setToriiBaseUrlSpy: vi.fn(),
    resetToriiBaseUrlSpy: vi.fn(),
    retryToriiFailoverSpy: vi.fn(),
    successSpy: vi.fn(),
    errorSpy: vi.fn(),
  }));

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn(),
}));

vi.mock('@/shared/api', () => ({
  getToriiBaseUrl: () => 'https://taira.sora.org',
  getExplorerApiBase: () => 'https://taira.sora.org/v1/explorer',
  isToriiBaseUrlForced: () => forcedState.value,
  setToriiBaseUrl: setToriiBaseUrlSpy,
  resetToriiBaseUrl: resetToriiBaseUrlSpy,
  retryToriiFailover: retryToriiFailoverSpy,
  useToriiAvailability: () => ({
    state: { value: 'healthy' },
    failureCount: { value: 0 },
    lastError: { value: null },
    lastSwitch: { value: null },
  }),
}));

vi.mock('@/shared/ui/composables/notifications', () => ({
  useNotifications: () => ({ success: successSpy, error: errorSpy }),
}));

const BaseButtonStub = {
  props: ['disabled', 'pressed'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
};

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      settings: {
        nodeSelector: 'Node',
        nodeLabel: 'Torii base URL',
        explorerBase: 'Explorer base',
        retryFailover: 'Retry failover',
        reset: 'Reset',
        apply: 'Apply',
        nodeSaved: 'Node updated',
        nodeReset: 'Node reset',
        nodeInvalid: 'Invalid Torii URL',
        nodeHealth: { healthy: 'Node healthy' },
      },
    },
  },
});

function factory() {
  return mount(NodeSettings, {
    attachTo: document.body,
    global: {
      plugins: [i18n],
      stubs: { BaseButton: BaseButtonStub },
    },
  });
}

async function openSettings() {
  const trigger = document.querySelector('.node-settings__button') as HTMLButtonElement;
  trigger.click();
  await flushPromises();
}

async function submitUrl(value: string) {
  const input = document.querySelector('.node-settings__input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await flushPromises();
  const buttons = Array.from(document.querySelectorAll('.node-settings__actions button')) as HTMLButtonElement[];
  buttons.at(-1)?.click();
  await flushPromises();
}

describe('NodeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `<div id="${PORTAL_ID}"></div>`;
    forcedState.value = false;
    setToriiBaseUrlSpy.mockImplementation(() => {
      throw new Error('invalid Torii URL');
    });
    resetToriiBaseUrlSpy.mockReturnValue('https://taira.sora.org');
    retryToriiFailoverSpy.mockResolvedValue(false);
    const dropdown = useNodeSettingsDropdown();
    if (dropdown.isOpen.value) dropdown.toggle();
  });

  it.each([
    'relative-node',
    'ftp://torii.example',
    'https://user:secret@torii.example',
    'https://torii.example/v1/explorer',
    'https://torii.example?network=other',
  ])('keeps the editor open and reports invalid custom URL %s', async (invalidUrl) => {
    const wrapper = factory();
    await openSettings();

    await submitUrl(invalidUrl);

    expect(setToriiBaseUrlSpy).toHaveBeenCalledWith(invalidUrl);
    expect(errorSpy).toHaveBeenCalledWith('Invalid Torii URL');
    expect(successSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.node-settings__dropdown')).not.toBeNull();
    wrapper.unmount();
  });

  it('applies an exact URL and closes only after the API accepts it', async () => {
    setToriiBaseUrlSpy.mockReturnValue('https://validator.example:8080');
    const wrapper = factory();
    await openSettings();

    await submitUrl('https://validator.example:8080');

    expect(successSpy).toHaveBeenCalledWith('Node updated');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.node-settings__dropdown')).toBeNull();
    wrapper.unmount();
  });

  it('does not expose an interactive selector when runtime config locks the Torii origin', async () => {
    forcedState.value = true;
    const wrapper = factory();

    const trigger = wrapper.get('.node-settings__button');
    expect(trigger.attributes('disabled')).toBeDefined();
    await trigger.trigger('click');
    await flushPromises();

    expect(document.querySelector('.node-settings__dropdown')).toBeNull();
    expect(setToriiBaseUrlSpy).not.toHaveBeenCalled();
    expect(resetToriiBaseUrlSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
