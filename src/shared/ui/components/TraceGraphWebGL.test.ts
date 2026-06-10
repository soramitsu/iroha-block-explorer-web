import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import TraceGraphWebGL from './TraceGraphWebGL.vue';

const SAMPLE_I105 = 'sorauﾛ1NﾗhBUd2BﾂｦﾄiﾔﾆﾂﾇKSﾃaﾘﾒﾓQﾗrﾒoﾘﾅnｳﾘbQｳQJﾆLJ5HSE';
const SAMPLE_I105_ALT = 'sorauﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB';

type WebGLMock = WebGLRenderingContext & Record<string, any>;

function createWebGlMock(): WebGLMock {
  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    LINES: 0x0001,
    POINTS: 0x0000,
    COLOR_BUFFER_BIT: 0x4000,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    viewport: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    useProgram: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    uniform3f: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    drawArrays: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
  } as unknown as WebGLMock;

  return gl;
}

function configureCanvas(canvas: HTMLCanvasElement) {
  Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 400 });
  Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 300 });
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
}

async function dispatchCanvasEvent(
  canvas: HTMLCanvasElement,
  type: string,
  init: { pointerId?: number, clientX?: number, clientY?: number, deltaY?: number }
) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    pointerId?: number
    clientX?: number
    clientY?: number
    deltaY?: number
  };
  if (init.pointerId !== undefined) Object.defineProperty(event, 'pointerId', { value: init.pointerId });
  if (init.clientX !== undefined) Object.defineProperty(event, 'clientX', { value: init.clientX });
  if (init.clientY !== undefined) Object.defineProperty(event, 'clientY', { value: init.clientY });
  if (init.deltaY !== undefined) Object.defineProperty(event, 'deltaY', { value: init.deltaY });
  canvas.dispatchEvent(event);
  await Promise.resolve();
}

describe('TraceGraphWebGL', () => {
  let gl: WebGLMock;

  beforeEach(() => {
    gl = createWebGlMock();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) => {
      if (kind === 'webgl') return gl;
      return null;
    });
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('emits selected node id on click hit', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [{ id: SAMPLE_I105, x: 0, y: 0, riskScore: 30 }],
        edges: [],
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 1, clientX: 200, clientY: 150 });

    expect(wrapper.emitted('select-node')?.[0]?.[0]).toBe(SAMPLE_I105);
  });

  it('emits node context payload anchored to the selected node position', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [{ id: SAMPLE_I105, x: 0, y: 0, riskScore: 30 }],
        edges: [],
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 1, clientX: 200, clientY: 150 });

    const payload = wrapper.emitted('node-context')?.[0]?.[0] as {
      nodeId: string
      x: number
      y: number
      width: number
      height: number
    };
    expect(payload.nodeId).toBe(SAMPLE_I105);
    expect(payload.x).toBeCloseTo(200, 1);
    expect(payload.y).toBeCloseTo(150, 1);
    expect(payload.width).toBe(400);
    expect(payload.height).toBe(300);
  });

  it('does not emit selection when pointer interaction is a drag', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [{ id: SAMPLE_I105, x: 0, y: 0, riskScore: 30 }],
        edges: [],
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointermove', { pointerId: 1, clientX: 240, clientY: 190 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 1, clientX: 240, clientY: 190 });

    expect(wrapper.emitted('select-node')).toBeUndefined();
  });

  it('emits null when clicking empty canvas area', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [{ id: SAMPLE_I105, x: 0, y: 0, riskScore: 30 }],
        edges: [],
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 1, clientX: 20, clientY: 20 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 1, clientX: 20, clientY: 20 });

    expect(wrapper.emitted('select-node')?.[0]?.[0]).toBeNull();
  });

  it('resets viewport pan/zoom when reset nonce changes', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [{ id: SAMPLE_I105, x: 0, y: 0, riskScore: 30 }],
        edges: [],
        viewportResetNonce: 0,
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 1, clientX: 200, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointermove', { pointerId: 1, clientX: 360, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 1, clientX: 360, clientY: 150 });

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 2, clientX: 200, clientY: 150 });
    expect(wrapper.emitted('select-node')?.at(-1)?.[0]).toBeNull();

    await wrapper.setProps({ viewportResetNonce: 1 });

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 3, clientX: 200, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 3, clientX: 200, clientY: 150 });
    expect(wrapper.emitted('select-node')?.at(-1)?.[0]).toBe(SAMPLE_I105);
  });

  it('handles wheel zoom without errors and redraws', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [
          { id: SAMPLE_I105, x: -1, y: 0, riskScore: 30 },
          { id: SAMPLE_I105_ALT, x: 1, y: 0, riskScore: 45 },
        ],
        edges: [
          { id: 'edge-1', sourceX: -1, sourceY: 0, targetX: 1, targetY: 0 },
        ],
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);
    const uniform1fMock = gl.uniform1f as unknown as ReturnType<typeof vi.fn>;
    uniform1fMock.mockClear();

    await dispatchCanvasEvent(canvas, 'wheel', { clientX: 200, clientY: 150, deltaY: -120 });

    expect(uniform1fMock).toHaveBeenCalled();
    expect(wrapper.emitted('viewport-interaction')).toHaveLength(1);
  });

  it('keeps node hit target stable when zooming at cursor position', async () => {
    const wrapper = mount(TraceGraphWebGL, {
      props: {
        nodes: [
          { id: SAMPLE_I105, x: -1, y: 0, riskScore: 30 },
          { id: SAMPLE_I105_ALT, x: 1, y: 0, riskScore: 45 },
        ],
        edges: [],
      },
    });

    const canvas = wrapper.get('[data-test="trace-graph-canvas"]').element as HTMLCanvasElement;
    configureCanvas(canvas);

    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 1, clientX: 365, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 1, clientX: 365, clientY: 150 });
    expect(wrapper.emitted('select-node')?.at(-1)?.[0]).toBe(SAMPLE_I105_ALT);

    await dispatchCanvasEvent(canvas, 'wheel', { clientX: 365, clientY: 150, deltaY: -120 });
    await dispatchCanvasEvent(canvas, 'pointerdown', { pointerId: 2, clientX: 365, clientY: 150 });
    await dispatchCanvasEvent(canvas, 'pointerup', { pointerId: 2, clientX: 365, clientY: 150 });

    expect(wrapper.emitted('select-node')?.at(-1)?.[0]).toBe(SAMPLE_I105_ALT);
  });
});
