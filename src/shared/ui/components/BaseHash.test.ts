import { expect, test, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseHash from './BaseHash.vue';
import { i18n } from '@/shared/lib/localization';

const SAMPLE_I105 = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';
const SAMPLE_I105_MODERN = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_LEGACY = 'ed01204164BF554923ECE1FD412D241036D863A6AE430476C898248B8237D77534CFC4@genesis';
let toriiBaseUrl = 'https://nexus.mof3.sora.org:18080';

vi.mock('@/shared/api', () => ({
  getToriiBaseUrl: () => toriiBaseUrl,
}));

test.each([
  [
    { hash: SAMPLE_I105, type: 'full' as const },
    SAMPLE_I105,
  ],
  [
    { hash: SAMPLE_I105, type: 'medium' as const },
    'sorauﾛ1Npﾃ...ﾙFvｵE9LBLB',
  ],
  [
    { hash: SAMPLE_I105, type: 'short' as const },
    'sora...LBLB',
  ],
  [
    {
      hash: SAMPLE_I105,
      type: 'two-line' as const,
    },
    'sora...<br>LBLB',
  ],
  [
    {
      hash: SAMPLE_LEGACY,
      type: 'two-line' as const,
    },
    'ed01...CFC4<br>@genesis',
  ],
])('BaseHash content display correctness', async (props, expected) => {
  toriiBaseUrl = 'https://nexus.mof3.sora.org:18080';
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
