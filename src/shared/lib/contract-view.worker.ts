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

interface ContractViewWorkerScope {
  onmessage: ((event: MessageEvent<ContractViewWorkerRequest>) => void) | null
  postMessage: (message: ContractViewWorkerSuccess | ContractViewWorkerFailure) => void
}

const workerScope = self as unknown as ContractViewWorkerScope;

workerScope.onmessage = (event: MessageEvent<ContractViewWorkerRequest>) => {
  try {
    const view = buildLocalContractCodeView(event.data.options);
    const response: ContractViewWorkerSuccess = {
      id: event.data.id,
      ok: true,
      view,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: ContractViewWorkerFailure = {
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown worker error',
    };
    workerScope.postMessage(response);
  }
};

export {};
