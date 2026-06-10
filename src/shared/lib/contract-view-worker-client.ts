import type { ContractCodeView } from '@/shared/api/schemas';
import {
  buildLocalContractCodeView,
  type BuildLocalContractCodeViewOptions,
} from './contract-view';

interface ContractViewWorkerRequest {
  id: number
  options: BuildLocalContractCodeViewOptions
}

interface ContractViewWorkerSuccess {
  id: number
  ok: true
  view: ContractCodeView | null
}

interface ContractViewWorkerFailure {
  id: number
  ok: false
  error: string
}

type ContractViewWorkerResponse = ContractViewWorkerSuccess | ContractViewWorkerFailure;

interface PendingRequest {
  options: BuildLocalContractCodeViewOptions
  resolve: (value: ContractCodeView | null) => void
}

let nextRequestId = 1;
let contractViewWorker: Worker | null = null;
const pendingRequests = new Map<number, PendingRequest>();

function resolvePendingWithFallback(entry: PendingRequest) {
  entry.resolve(buildLocalContractCodeView(entry.options));
}

function flushPendingWithFallback() {
  for (const entry of pendingRequests.values()) {
    resolvePendingWithFallback(entry);
  }
  pendingRequests.clear();
}

function teardownWorker() {
  contractViewWorker?.terminate();
  contractViewWorker = null;
}

function handleWorkerMessage(event: MessageEvent<ContractViewWorkerResponse>) {
  const pending = pendingRequests.get(event.data.id);
  if (!pending) return;
  pendingRequests.delete(event.data.id);

  if (event.data.ok) {
    pending.resolve(event.data.view);
    return;
  }

  resolvePendingWithFallback(pending);
}

function handleWorkerFailure() {
  flushPendingWithFallback();
  teardownWorker();
}

function createContractViewWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;

  try {
    const worker = new Worker(new URL('./contract-view.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = handleWorkerMessage as (event: MessageEvent) => void;
    worker.onerror = handleWorkerFailure;
    return worker;
  } catch {
    return null;
  }
}

function getContractViewWorker(): Worker | null {
  if (contractViewWorker) return contractViewWorker;
  contractViewWorker = createContractViewWorker();
  return contractViewWorker;
}

export async function computeContractCodeViewInBackground(
  options: BuildLocalContractCodeViewOptions
): Promise<ContractCodeView | null> {
  const worker = getContractViewWorker();
  if (!worker) {
    return buildLocalContractCodeView(options);
  }

  return new Promise((resolve) => {
    const requestId = nextRequestId;
    nextRequestId += 1;
    pendingRequests.set(requestId, { options, resolve });

    try {
      const request: ContractViewWorkerRequest = {
        id: requestId,
        options,
      };
      worker.postMessage(request);
    } catch {
      const pending = pendingRequests.get(requestId);
      if (!pending) return;
      pendingRequests.delete(requestId);
      resolvePendingWithFallback(pending);
    }
  });
}

export function resetContractCodeViewWorkerClientForTests() {
  flushPendingWithFallback();
  teardownWorker();
  nextRequestId = 1;
}
