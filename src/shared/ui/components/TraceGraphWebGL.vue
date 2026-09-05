<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

interface GraphNode {
  id: string
  x: number
  y: number
  riskScore?: number
  prominence?: number
}

interface GraphEdge {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  flow?: 'incoming' | 'outgoing' | 'neutral'
}

const props = defineProps<{
  nodes: GraphNode[]
  edges: GraphEdge[]
  selectedNodeId?: string | null
  viewportResetNonce?: number
}>();

const emit = defineEmits<{
  (event: 'select-node', nodeId: string | null): void
  (event: 'node-context', payload: {
    nodeId: string | null
    x: number
    y: number
    width: number
    height: number
  }): void
  (event: 'viewport-interaction'): void
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);

const viewport = reactive({
  panX: 0,
  panY: 0,
  zoom: 1,
});

const limits = {
  minZoom: 0.05,
  maxZoom: 250,
};

const interaction = reactive({
  dragging: false,
  pointerId: -1,
  moved: false,
  startClientX: 0,
  startClientY: 0,
});

let gl: WebGLRenderingContext | null = null;
let linesProgram: WebGLProgram | null = null;
let pointsProgram: WebGLProgram | null = null;
let lineBuffer: WebGLBuffer | null = null;
let lineFlowBuffer: WebGLBuffer | null = null;
let pointPositionBuffer: WebGLBuffer | null = null;
let pointSizeBuffer: WebGLBuffer | null = null;
let pointRiskBuffer: WebGLBuffer | null = null;
let resizeObserver: ResizeObserver | null = null;
let pendingFrame = 0;

const lineVertexCount = ref(0);
const pointCount = ref(0);
const EDGE_SEGMENTS = 16;
const EDGE_HALF_THICKNESS_WORLD = 0.03;

const nodeHitData = computed(() =>
  props.nodes.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    prominence: node.prominence ?? 0,
  }))
);

function createShader(context: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = context.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const log = context.getShaderInfoLog(shader) || 'Unknown shader compile error';
    context.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(context: WebGLRenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = createShader(context, context.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(context, context.FRAGMENT_SHADER, fragmentSource);
  const program = context.createProgram();
  if (!program) throw new Error('Failed to create program');

  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    const log = context.getProgramInfoLog(program) || 'Unknown program link error';
    context.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

function getCanvasAspect(canvas: HTMLCanvasElement): number {
  return canvas.height > 0 ? canvas.width / canvas.height : 1;
}

function fitViewportToNodes() {
  const canvas = canvasRef.value;
  if (!canvas || props.nodes.length === 0) return;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of props.nodes) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  }

  const width = Math.max(0.0001, maxX - minX);
  const height = Math.max(0.0001, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const aspect = getCanvasAspect(canvas);
  const zoomForWidth = (2 * aspect) / (width * 1.2);
  const zoomForHeight = 2 / (height * 1.2);

  viewport.zoom = Math.max(limits.minZoom, Math.min(limits.maxZoom, Math.min(zoomForWidth, zoomForHeight)));
  viewport.panX = -centerX;
  viewport.panY = -centerY;
}

function resetViewportToFit() {
  fitViewportToNodes();
  scheduleDraw();
}

function updateCanvasSize() {
  const canvas = canvasRef.value;
  if (!canvas || !gl) return;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width === width && canvas.height === height) return;

  canvas.width = width;
  canvas.height = height;
  gl.viewport(0, 0, width, height);
}

function hashEdgeId(value: string): number {
  let hash = 0;
  for (let idx = 0; idx < value.length; idx += 1) {
    hash = Math.imul(hash, 31) + value.charCodeAt(idx);
  }
  return hash >>> 0;
}

function resolveEdgeFlowValue(direction: GraphEdge['flow']): number {
  if (direction === 'incoming') return -1;
  if (direction === 'outgoing') return 1;
  return 0;
}

function quadraticBezier(curve: readonly [number, number, number], t: number): number {
  const oneMinusT = 1 - t;
  const [start, control, end] = curve;
  return oneMinusT * oneMinusT * start + 2 * oneMinusT * t * control + t * t * end;
}

function uploadLineBuffer() {
  if (!gl || !lineBuffer || !lineFlowBuffer) return;

  const segmentsPerEdge = EDGE_SEGMENTS;
  const vertices: number[] = [];
  const flows: number[] = [];

  for (const edge of props.edges) {
    const dx = edge.targetX - edge.sourceX;
    const dy = edge.targetY - edge.sourceY;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const normalX = -dy / length;
    const normalY = dx / length;
    const signedCurvature = ((hashEdgeId(edge.id) & 1) === 0 ? 1 : -1) * Math.min(1.2, Math.max(0.2, length * 0.24));

    const controlX = (edge.sourceX + edge.targetX) / 2 + normalX * signedCurvature;
    const controlY = (edge.sourceY + edge.targetY) / 2 + normalY * signedCurvature;
    const flowValue = resolveEdgeFlowValue(edge.flow);
    const curveX = [edge.sourceX, controlX, edge.targetX] as const;
    const curveY = [edge.sourceY, controlY, edge.targetY] as const;

    for (let segment = 0; segment < segmentsPerEdge; segment += 1) {
      const t0 = segment / segmentsPerEdge;
      const t1 = (segment + 1) / segmentsPerEdge;
      const startX = quadraticBezier(curveX, t0);
      const startY = quadraticBezier(curveY, t0);
      const endX = quadraticBezier(curveX, t1);
      const endY = quadraticBezier(curveY, t1);
      const segDx = endX - startX;
      const segDy = endY - startY;
      const segLength = Math.max(0.0001, Math.hypot(segDx, segDy));
      const halfWidthX = (-segDy / segLength) * EDGE_HALF_THICKNESS_WORLD;
      const halfWidthY = (segDx / segLength) * EDGE_HALF_THICKNESS_WORLD;
      const leftStartX = startX + halfWidthX;
      const leftStartY = startY + halfWidthY;
      const rightStartX = startX - halfWidthX;
      const rightStartY = startY - halfWidthY;
      const leftEndX = endX + halfWidthX;
      const leftEndY = endY + halfWidthY;
      const rightEndX = endX - halfWidthX;
      const rightEndY = endY - halfWidthY;

      vertices.push(
        leftStartX,
        leftStartY,
        rightStartX,
        rightStartY,
        leftEndX,
        leftEndY,
        rightStartX,
        rightStartY,
        rightEndX,
        rightEndY,
        leftEndX,
        leftEndY
      );
      flows.push(flowValue, flowValue, flowValue, flowValue, flowValue, flowValue);
    }
  }

  lineVertexCount.value = vertices.length / 2;
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineFlowBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(flows), gl.STATIC_DRAW);
}

function uploadPointBuffers() {
  if (!gl || !pointPositionBuffer || !pointSizeBuffer || !pointRiskBuffer) return;

  const positions = new Float32Array(props.nodes.length * 2);
  const sizes = new Float32Array(props.nodes.length);
  const risks = new Float32Array(props.nodes.length);
  let offset = 0;
  for (let idx = 0; idx < props.nodes.length; idx += 1) {
    const node = props.nodes[idx];
    positions[offset++] = node.x;
    positions[offset++] = node.y;
    const selected = props.selectedNodeId === node.id;
    const prominence = Math.max(0, Math.min(1, node.prominence ?? 0));
    sizes[idx] = selected ? 28 + prominence * 6 : 9 + prominence * 18;
    risks[idx] = selected ? 1 : Math.max(0, Math.min(1, (node.riskScore ?? 0) / 100));
  }
  pointCount.value = props.nodes.length;

  gl.bindBuffer(gl.ARRAY_BUFFER, pointPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, pointSizeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, pointRiskBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, risks, gl.STATIC_DRAW);
}

function scheduleDraw() {
  if (pendingFrame !== 0) return;
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    draw();
  });
}

function applyViewportUniforms(program: WebGLProgram) {
  if (!gl || !canvasRef.value) return;
  const aspect = getCanvasAspect(canvasRef.value);
  const zoomLoc = gl.getUniformLocation(program, 'u_zoom');
  const panLoc = gl.getUniformLocation(program, 'u_pan');
  const aspectLoc = gl.getUniformLocation(program, 'u_aspect');
  if (zoomLoc) gl.uniform1f(zoomLoc, viewport.zoom);
  if (panLoc) gl.uniform2f(panLoc, viewport.panX, viewport.panY);
  if (aspectLoc) gl.uniform1f(aspectLoc, aspect);
}

function draw() {
  const canvas = canvasRef.value;
  if (!gl || !canvas || !linesProgram || !pointsProgram) return;

  updateCanvasSize();

  gl.clearColor(0.01, 0.03, 0.06, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (lineVertexCount.value > 0 && lineBuffer && lineFlowBuffer) {
    gl.useProgram(linesProgram);
    applyViewportUniforms(linesProgram);
    const positionLoc = gl.getAttribLocation(linesProgram, 'a_position');
    const flowLoc = gl.getAttribLocation(linesProgram, 'a_flow');
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineFlowBuffer);
    gl.enableVertexAttribArray(flowLoc);
    gl.vertexAttribPointer(flowLoc, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, lineVertexCount.value);
  }

  if (pointCount.value > 0 && pointPositionBuffer && pointSizeBuffer && pointRiskBuffer) {
    gl.useProgram(pointsProgram);
    applyViewportUniforms(pointsProgram);

    const positionLoc = gl.getAttribLocation(pointsProgram, 'a_position');
    const sizeLoc = gl.getAttribLocation(pointsProgram, 'a_size');
    const riskLoc = gl.getAttribLocation(pointsProgram, 'a_risk');

    gl.bindBuffer(gl.ARRAY_BUFFER, pointPositionBuffer);
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pointSizeBuffer);
    gl.enableVertexAttribArray(sizeLoc);
    gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pointRiskBuffer);
    gl.enableVertexAttribArray(riskLoc);
    gl.vertexAttribPointer(riskLoc, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, pointCount.value);
  }
}

function screenToWorld(clientX: number, clientY: number): { x: number, y: number } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const nx = (x / rect.width) * 2 - 1;
  const ny = 1 - (y / rect.height) * 2;
  const aspect = getCanvasAspect(canvas);
  return {
    x: (nx * aspect) / viewport.zoom - viewport.panX,
    y: ny / viewport.zoom - viewport.panY,
  };
}

function worldToCanvas(worldX: number, worldY: number): { x: number, y: number, width: number, height: number } | null {
  const canvas = canvasRef.value;
  if (!canvas) return null;

  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const aspect = getCanvasAspect(canvas);
  const clipX = ((worldX + viewport.panX) * viewport.zoom) / aspect;
  const clipY = (worldY + viewport.panY) * viewport.zoom;
  const x = ((clipX + 1) * 0.5) * width;
  const y = ((1 - clipY) * 0.5) * height;

  return {
    x,
    y,
    width,
    height,
  };
}

function resolveNodeContextPayload(nodeId: string | null, clientX: number, clientY: number): {
  nodeId: string | null
  x: number
  y: number
  width: number
  height: number
} {
  const canvas = canvasRef.value;
  if (!canvas) {
    return {
      nodeId,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, canvas.clientWidth || rect.width);
  const height = Math.max(1, canvas.clientHeight || rect.height);
  let x = clientX - rect.left;
  let y = clientY - rect.top;

  if (nodeId) {
    const hit = nodeHitData.value.find((node) => node.id === nodeId);
    if (hit) {
      const projected = worldToCanvas(hit.x, hit.y);
      if (projected) {
        x = projected.x;
        y = projected.y;
      }
    }
  }

  return {
    nodeId,
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
    width,
    height,
  };
}

function resolveHitNode(clientX: number, clientY: number): string | null {
  const canvas = canvasRef.value;
  if (!canvas || nodeHitData.value.length === 0) return null;
  const world = screenToWorld(clientX, clientY);
  if (!world) return null;

  let bestNode: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodeHitData.value) {
    const radiusPx = 10 + Math.max(0, Math.min(1, node.prominence)) * 16;
    const radiusWorld = ((radiusPx / Math.max(1, canvas.clientHeight)) * 2) / viewport.zoom;
    const radius2 = radiusWorld * radiusWorld;
    const dx = node.x - world.x;
    const dy = node.y - world.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > radius2) continue;
    if (d2 < bestDistance) {
      bestDistance = d2;
      bestNode = node.id;
    }
  }
  return bestNode;
}

function onCanvasWheel(event: WheelEvent) {
  const before = screenToWorld(event.clientX, event.clientY);
  if (!before) return;

  const factor = Math.exp(-event.deltaY * 0.0015);
  const nextZoom = Math.max(limits.minZoom, Math.min(limits.maxZoom, viewport.zoom * factor));
  if (nextZoom === viewport.zoom) return;
  viewport.zoom = nextZoom;
  const after = screenToWorld(event.clientX, event.clientY);
  if (!after) return;
  viewport.panX += before.x - after.x;
  viewport.panY += before.y - after.y;
  emit('viewport-interaction');
  scheduleDraw();
}

function onPointerDown(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  interaction.dragging = true;
  interaction.pointerId = event.pointerId;
  interaction.startClientX = event.clientX;
  interaction.startClientY = event.clientY;
  interaction.moved = false;
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
  if (!interaction.dragging || interaction.pointerId !== event.pointerId) return;
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dx = event.clientX - interaction.startClientX;
  const dy = event.clientY - interaction.startClientY;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interaction.moved = true;

  const aspect = getCanvasAspect(canvas);
  const clipDx = ((dx / rect.width) * 2 * aspect) / viewport.zoom;
  const clipDy = ((-dy / rect.height) * 2) / viewport.zoom;
  viewport.panX += clipDx;
  viewport.panY += clipDy;
  if (interaction.moved) emit('viewport-interaction');
  interaction.startClientX = event.clientX;
  interaction.startClientY = event.clientY;
  scheduleDraw();
}

function onPointerUp(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!interaction.dragging || interaction.pointerId !== event.pointerId || !canvas) return;
  canvas.releasePointerCapture(event.pointerId);
  const didMove = interaction.moved;
  interaction.dragging = false;
  interaction.pointerId = -1;
  interaction.moved = false;

  if (!didMove) {
    const nodeId = resolveHitNode(event.clientX, event.clientY);
    emit('select-node', nodeId);
    emit('node-context', resolveNodeContextPayload(nodeId, event.clientX, event.clientY));
  }
}

function onPointerCancel(event: PointerEvent) {
  if (interaction.pointerId !== event.pointerId) return;
  interaction.dragging = false;
  interaction.pointerId = -1;
  interaction.moved = false;
}

function initialize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) return;

  linesProgram = createProgram(
    gl,
    `
    attribute vec2 a_position;
    attribute float a_flow;
    uniform vec2 u_pan;
    uniform float u_zoom;
    uniform float u_aspect;
    varying float v_flow;
    void main() {
      vec2 world = (a_position + u_pan) * u_zoom;
      gl_Position = vec4(world.x / u_aspect, world.y, 0.0, 1.0);
      v_flow = a_flow;
    }
    `,
    `
    precision mediump float;
    varying float v_flow;
    void main() {
      vec3 neutral = vec3(0.16, 0.38, 0.64);
      vec3 incoming = vec3(0.12, 0.86, 0.98);
      vec3 outgoing = vec3(0.99, 0.64, 0.20);
      float incomingMix = smoothstep(-1.0, -0.1, v_flow);
      float outgoingMix = smoothstep(0.1, 1.0, v_flow);
      vec3 color = mix(neutral, incoming, incomingMix);
      color = mix(color, outgoing, outgoingMix);
      color = mix(color, vec3(0.95, 0.98, 1.0), 0.12);
      float alpha = mix(0.30, 0.78, max(incomingMix, outgoingMix));
      gl_FragColor = vec4(color, alpha);
    }
    `
  );

  pointsProgram = createProgram(
    gl,
    `
    attribute vec2 a_position;
    attribute float a_size;
    attribute float a_risk;
    uniform vec2 u_pan;
    uniform float u_zoom;
    uniform float u_aspect;
    varying float v_risk;
    void main() {
      vec2 world = (a_position + u_pan) * u_zoom;
      gl_Position = vec4(world.x / u_aspect, world.y, 0.0, 1.0);
      gl_PointSize = a_size;
      v_risk = a_risk;
    }
    `,
    `
    precision mediump float;
    varying float v_risk;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float d = length(p);
      if (d > 1.0) discard;
      vec3 low = vec3(0.25, 0.92, 0.95);
      vec3 high = vec3(1.00, 0.36, 0.18);
      float risk = clamp(v_risk, 0.0, 1.0);
      vec3 base = mix(low, high, risk);
      float core = smoothstep(0.36, 0.0, d);
      float rim = 1.0 - smoothstep(0.6, 1.0, d);
      vec3 color = mix(base * 0.72 + vec3(0.06, 0.08, 0.12), base, core);
      color += rim * 0.28 * mix(vec3(0.35, 0.95, 1.0), vec3(1.0, 0.67, 0.28), risk);
      float alpha = mix(0.38, 1.0, core) + rim * 0.24;
      gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
    }
    `
  );

  lineBuffer = gl.createBuffer();
  lineFlowBuffer = gl.createBuffer();
  pointPositionBuffer = gl.createBuffer();
  pointSizeBuffer = gl.createBuffer();
  pointRiskBuffer = gl.createBuffer();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  updateCanvasSize();
  fitViewportToNodes();
  uploadLineBuffer();
  uploadPointBuffers();
  draw();

  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize();
    scheduleDraw();
  });
  resizeObserver.observe(canvas);
}

function destroy() {
  if (pendingFrame !== 0) {
    cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (!gl) return;

  if (lineBuffer) gl.deleteBuffer(lineBuffer);
  if (lineFlowBuffer) gl.deleteBuffer(lineFlowBuffer);
  if (pointPositionBuffer) gl.deleteBuffer(pointPositionBuffer);
  if (pointSizeBuffer) gl.deleteBuffer(pointSizeBuffer);
  if (pointRiskBuffer) gl.deleteBuffer(pointRiskBuffer);
  if (linesProgram) gl.deleteProgram(linesProgram);
  if (pointsProgram) gl.deleteProgram(pointsProgram);

  lineBuffer = null;
  lineFlowBuffer = null;
  pointPositionBuffer = null;
  pointSizeBuffer = null;
  pointRiskBuffer = null;
  linesProgram = null;
  pointsProgram = null;
  gl = null;
}

onMounted(() => {
  initialize();
});

onBeforeUnmount(() => {
  destroy();
});

watch(
  () => props.edges,
  () => {
    uploadLineBuffer();
    scheduleDraw();
  }
);

watch(
  [() => props.nodes, () => props.selectedNodeId] as const,
  ([nodes], previous) => {
    const prevNodes = previous?.[0] ?? [];
    const changedCount = nodes.length !== prevNodes.length;
    if (changedCount) fitViewportToNodes();
    uploadPointBuffers();
    scheduleDraw();
  }
);

watch(
  () => props.viewportResetNonce,
  (next, previous) => {
    if (next === previous) return;
    resetViewportToFit();
  }
);
</script>

<template>
  <div class="trace-graph-webgl">
    <canvas
      ref="canvasRef"
      class="trace-graph-webgl__canvas"
      data-test="trace-graph-canvas"
      @wheel.prevent="onCanvasWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    />
  </div>
</template>

<style lang="scss">
@use '@/shared/ui/styles/main' as *;

.trace-graph-webgl {
  position: relative;
  width: 100%;
  min-height: size(46);
  border-radius: size(2.5);
  border: 1px solid color-mix(in srgb, theme-color('primary') 42%, theme-color('border-primary'));
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 14%, rgb(34 130 221 / 30%), rgb(2 8 16 / 92%) 52%),
    radial-gradient(circle at 84% 90%, rgb(233 127 58 / 20%), transparent 46%),
    linear-gradient(180deg, rgb(4 10 18 / 96%), rgb(1 5 11 / 98%));
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 4%),
    0 size(2) size(5) rgb(0 0 0 / 34%);

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      repeating-linear-gradient(
        0deg,
        rgb(120 174 220 / 7%) 0,
        rgb(120 174 220 / 7%) 1px,
        transparent 1px,
        transparent 28px
      ),
      repeating-linear-gradient(
        90deg,
        rgb(120 174 220 / 6%) 0,
        rgb(120 174 220 / 6%) 1px,
        transparent 1px,
        transparent 28px
      );
    opacity: 0.85;
  }

  &__canvas {
    position: relative;
    z-index: 1;
    display: block;
    width: 100%;
    height: size(62);
    touch-action: none;
    cursor: grab;

    &:active {
      cursor: grabbing;
    }
  }
}
</style>
