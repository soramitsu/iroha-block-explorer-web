import { describe, expect, it } from 'vitest';
import { buildKotodamaStudioSource, describeKotodamaStudioSummary } from './kotodama-studio-source';

describe('kotodama studio source', () => {
  it('stitches sections into Kotodama-like source with metadata comments', () => {
    const source = buildKotodamaStudioSource({
      title: 'RewardGarden',
      dataspace: 'public-play',
      authority: 'alice@play.main',
      chainId: 'wonderland',
      description: 'Reward players with bright blocks.',
      sections: {
        stateSection: '  state int confetti;\n',
        entrypointSection: '  kotoage fn celebrate() {\n    info("yay");\n  }\n',
        triggerSection: '  register_trigger sparkle {\n    call celebrate;\n    on time pre_commit;\n  }\n',
      },
      summary: {
        states: ['confetti'],
        entrypoints: [{ name: 'celebrate', kind: 'kotoage', permission: null }],
        triggers: [{ id: 'sparkle', entrypoint: 'celebrate', mode: 'pre_commit' }],
      },
    });

    expect(source).toContain('// dataspace: public-play');
    expect(source).toContain('// authority: alice@play.main');
    expect(source).not.toContain('// namespace:');
    expect(source).not.toContain('// contract_id:');
    expect(source).toContain('seiyaku RewardGarden {');
    expect(source).toContain('state int confetti;');
    expect(source).toContain('register_trigger sparkle');
  });

  it('falls back to a starter entrypoint when the workspace is empty', () => {
    const source = buildKotodamaStudioSource({
      title: 'StarterKit',
      dataspace: 'universal',
      authority: 'operator@studio.main',
      chainId: 'wonderland',
      description: '',
      sections: {
        stateSection: '',
        entrypointSection: '',
        triggerSection: '',
      },
      summary: {
        states: [],
        entrypoints: [],
        triggers: [],
      },
    });

    expect(source).toContain('kotoage fn main()');
    expect(source).toContain('Build your first colorful rule.');
  });

  it('describes the workspace summary in plain language', () => {
    expect(
      describeKotodamaStudioSummary({
        states: ['counter', 'badge'],
        entrypoints: [
          { name: 'celebrate', kind: 'kotoage', permission: null },
          { name: 'reset', kind: 'kotoage', permission: 'Admin' },
        ],
        triggers: [{ id: 'sparkle', entrypoint: 'celebrate', mode: 'schedule' }],
      })
    ).toBe('2 entrypoints, 1 trigger, 2 state fields. Main actions: celebrate, reset.');
  });
});
