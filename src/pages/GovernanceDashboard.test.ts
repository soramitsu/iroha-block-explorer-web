import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import GovernanceDashboard from './GovernanceDashboard.vue';
import { i18n } from '@/shared/lib/localization';

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h1>{{ title }}</h1><slot /></section>',
};

describe('GovernanceDashboard', () => {
  it('presents governance as a canonical-request-authenticated surface', () => {
    const wrapper = mount(GovernanceDashboard, {
      global: {
        plugins: [i18n],
        stubs: { BaseContentBlock: BaseContentBlockStub },
      },
    });

    const boundary = wrapper.get('[data-test="governance-auth-boundary"]').text();
    expect(boundary).toContain('/v1/gov/*');
    expect(boundary).toContain('/v1/gov/capabilities');
    expect(boundary).toContain('network readiness');
    expect(boundary).toContain('not a caller-grant list');
    expect(boundary).toContain('X-Iroha-Account');
    expect(boundary).toContain('X-Iroha-Signature');
    expect(boundary).toContain('X-Iroha-Timestamp-Ms');
    expect(boundary).toContain('X-Iroha-Nonce');
    expect(boundary).toContain('X-Iroha-Witness');
    expect(wrapper.get('[data-test="governance-signature-auth"]').text()).toContain('must be sent together');
    expect(wrapper.get('[data-test="governance-witness-auth"]').text()).toContain('must not be combined');
  });

  it('documents the current authenticated contract without an unsigned fallback', () => {
    const wrapper = mount(GovernanceDashboard, {
      global: {
        plugins: [i18n],
        stubs: { BaseContentBlock: BaseContentBlockStub },
      },
    });

    expect(wrapper.get('[data-test="governance-auth-boundary"]').text()).toContain('does not retry them anonymously');
    expect(wrapper.get('[data-test="governance-current-contract"]').text()).toContain('does not authorize the caller');
  });
});
