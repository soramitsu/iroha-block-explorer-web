import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import KaigiRelays from './KaigiRelays.vue';
import { i18n } from '@/shared/lib/localization';

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h1>{{ title }}</h1><slot /></section>',
};

describe('KaigiRelays', () => {
  it('does not represent operator relay topology as public explorer data', () => {
    const wrapper = mount(KaigiRelays, {
      global: {
        plugins: [i18n],
        stubs: { BaseContentBlock: BaseContentBlockStub },
      },
    });

    const boundary = wrapper.get('[data-test="kaigi-operator-boundary"]').text();
    expect(boundary).toContain('OperatorSigningContext');
    expect(boundary).toContain('relay event stream requires canonical account signing');
    expect(boundary).toContain('call can be read publicly');
    expect(boundary).toContain('makes no KAIGI request');
  });

  it('documents WebAuthn operator signing and fail-closed behavior', () => {
    const wrapper = mount(KaigiRelays, {
      global: {
        plugins: [i18n],
        stubs: { BaseContentBlock: BaseContentBlockStub },
      },
    });

    const contract = wrapper.get('[data-test="kaigi-auth-contract"]').text();
    expect(contract).toContain('Operator WebAuthn signing');
    expect(contract).toContain('Canonical account signing');
    expect(contract).toContain('Fail closed');
    expect(contract).toContain('no unsigned fallback');
  });
});
