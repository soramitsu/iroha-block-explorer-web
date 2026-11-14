import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SoracloudPage from './SoracloudPage.vue';
import { i18n } from '@/shared/lib/localization';

const BaseContentBlockStub = {
  props: ['title'],
  template: '<section><h2>{{ title }}</h2><slot /></section>',
};

function mountPage() {
  return mount(SoracloudPage, {
    global: {
      plugins: [i18n],
      stubs: { BaseContentBlock: BaseContentBlockStub },
    },
  });
}

describe('SoracloudPage', () => {
  it('distinguishes public discovery from the canonical-account authentication boundary', () => {
    const wrapper = mountPage();

    expect(wrapper.find('[data-test="soracloud-auth-boundary"]').text()).toContain(
      'separates public service discovery from account-scoped reads'
    );
    expect(wrapper.text()).toContain('two service-discovery routes without account authentication');
    expect(wrapper.text()).toContain('does not issue unsigned requests to protected routes');
  });

  it('documents every current read route by exact authentication class', () => {
    const wrapper = mountPage();
    const publicRoutes = wrapper.find('[data-test="soracloud-public-routes"]').text();
    const authenticatedRoutes = wrapper.find('[data-test="soracloud-authenticated-routes"]').text();

    expect(wrapper.find('[data-test="soracloud-public-routes"]').findAll('li')).toHaveLength(2);
    expect(wrapper.find('[data-test="soracloud-authenticated-routes"]').findAll('li')).toHaveLength(14);
    expect(publicRoutes).toContain('/v1/soracloud/services/{service_name}/public-discovery');
    expect(publicRoutes).toContain(
      '/v1/soracloud/services/{service_name}/revisions/{service_version}/public-discovery'
    );
    expect(publicRoutes).not.toContain('/v1/soracloud/status');
    expect(authenticatedRoutes).toContain('/v1/soracloud/apps/status');
    expect(authenticatedRoutes).toContain('/v1/soracloud/apps/{app_name}/status');
    expect(authenticatedRoutes).toContain('/v1/soracloud/health/compliance/report');
    expect(authenticatedRoutes).toContain('/v1/soracloud/hf/lease/status');
    expect(authenticatedRoutes).toContain('/v1/soracloud/agent/autonomy/status');
  });
});
