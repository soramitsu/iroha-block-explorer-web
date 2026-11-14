import { expect, test, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseHash from './BaseHash.vue';
import { i18n } from '@/shared/lib/localization';

const SAMPLE_I105 = 'sorauﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV';
const SAMPLE_I105_MODERN = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_ALIAS = 'Treasury@Genesis';
let toriiBaseUrl = 'https://torii.example';

vi.mock('@/shared/api', () => ({
  getToriiBaseUrl: () => toriiBaseUrl,
  isToriiBaseUrlForced: () => false,
}));

test.each([
  [
    { hash: SAMPLE_I105, type: 'full' as const },
    SAMPLE_I105,
  ],
  [
    { hash: SAMPLE_I105, type: 'medium' as const },
    'sorauﾛ1Pﾉｳ...jﾑKﾋTCW2PV',
  ],
  [
    { hash: SAMPLE_I105, type: 'short' as const },
    'sora...W2PV',
  ],
  [
    {
      hash: SAMPLE_I105,
      type: 'two-line' as const,
    },
    'sora...<br>W2PV',
  ],
  [
    {
      hash: SAMPLE_ALIAS,
      type: 'two-line' as const,
    },
    'Trea...sury<br>@Genesis',
  ],
])('BaseHash content display correctness', async (props, expected) => {
  toriiBaseUrl = 'https://torii.example';
  const wrapper = mount(BaseHash, {
    props: {
      hash: props.hash,
      type: props.type,
    },
    global: {
      plugins: [i18n],
    },
  });

  expect(wrapper.find('.base-hash span').element.innerHTML).toBe(expected);
});

test('BaseHash preserves account ids and account links without network-prefix rewriting', async () => {
  toriiBaseUrl = 'https://taira.sora.org';
  const wrapper = mount(BaseHash, {
    props: {
      hash: SAMPLE_I105_MODERN,
      link: `/accounts/${encodeURIComponent(SAMPLE_I105_MODERN)}`,
      type: 'full',
    },
    global: {
      plugins: [i18n],
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="typeof to === \'string\' ? to : String(to)"><slot /></a>',
        },
      },
    },
  });

  expect(wrapper.text()).toContain(SAMPLE_I105_MODERN);
  expect(wrapper.get('a').attributes('href')).toContain(`/accounts/${encodeURIComponent(SAMPLE_I105_MODERN)}`);
});
