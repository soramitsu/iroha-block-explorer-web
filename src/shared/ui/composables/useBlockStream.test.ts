import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { useBlockStream } from './useBlockStream';

describe('useBlockStream', () => {
  it('is a safe no-op when block websocket streaming is unavailable', () => {
    const onBlock = () => undefined;
    const scope = effectScope();

    let api!: ReturnType<typeof useBlockStream>;
    scope.run(() => {
      api = useBlockStream(onBlock);
    });

    expect(api.isSupported).toBe(false);
    expect(api.isStreaming.value).toBe(false);
    expect(() => api.connectFrom(10)).not.toThrow();
    expect(() => api.disconnect()).not.toThrow();

    scope.stop();
  });
});
