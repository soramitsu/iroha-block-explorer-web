import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NotificationsInstance from '@/shared/ui/components/NotificationsInstance.vue';
import { useNotifications } from '@/shared/ui/composables/notifications';
import { i18n } from '@/shared/lib/localization';

function mountNotifications() {
  return mount(NotificationsInstance, {
    global: {
      plugins: [i18n],
    },
  });
}

describe('NotificationsInstance accessibility', () => {
  beforeEach(() => {
    useNotifications().list.value = [];
  });

  it('announces success politely and closes it with a native labelled button', async () => {
    const notifications = useNotifications();
    notifications.show({ type: 'success', message: 'Saved', autoClosing: false });
    const wrapper = mountNotifications();

    const item = wrapper.get('[role="status"]');
    expect(item.attributes('aria-live')).toBe('polite');
    expect(item.attributes('aria-atomic')).toBe('true');
    expect(item.text()).toContain('Saved');

    const close = wrapper.get('button.app-notifications__close');
    expect(close.element.tagName).toBe('BUTTON');
    expect(close.attributes('type')).toBe('button');
    expect(close.attributes('aria-label')).toBe('Dismiss notification');
    await close.trigger('click');

    expect(wrapper.find('.app-notifications').exists()).toBe(false);
  });

  it('announces errors assertively as alerts', () => {
    useNotifications().show({ type: 'error', message: 'Failed', autoClosing: false });
    const wrapper = mountNotifications();

    const item = wrapper.get('[role="alert"]');
    expect(item.attributes('aria-live')).toBe('assertive');
    expect(item.attributes('aria-atomic')).toBe('true');
    expect(item.text()).toContain('Failed');
  });
});
