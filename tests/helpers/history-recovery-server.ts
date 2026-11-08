import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import tairaHistory from '../fixtures/taira-history.json' with { type: 'json' };

/** A real HTTP peer for the native browser EventSource/history recovery gate. */
export async function startHistoryRecoveryServer(explorerOrigin: string) {
  const requests: { path: string, method: string, status?: number }[] = [];
  const unexpectedRequests: string[] = [];
  const streams = new Set<ServerResponse>();
  let streamReleased = false;
  let latestRequests = 0;
  let openedStreams = 0;

  function openStream(response: ServerResponse) {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
    response.flushHeaders();
    // Native EventSource must remain OPEN without a transaction message.
    // A comment is not an event and cannot populate the transaction list.
    response.write(': open, no transaction events\n\n');
    openedStreams += 1;
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? '';
    const observation = { path: `${url.pathname}${url.search}`, method, status: undefined as number | undefined };
    requests.push(observation);
    response.setHeader('access-control-allow-origin', explorerOrigin);
    response.setHeader('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type');
    response.setHeader('cache-control', 'no-store');
    if (method === 'OPTIONS') {
      observation.status = 204;
      response.writeHead(204).end();
      return;
    }
    const isCollectionRead = method === 'POST' && [
      '/v1/explorer/transactions/latest/query', '/v1/explorer/blocks/query',
    ].includes(url.pathname);
    if (!['GET', 'HEAD'].includes(method) && !isCollectionRead) {
      unexpectedRequests.push(`Write blocked: ${method} ${url.pathname}`);
      observation.status = 405;
      response.writeHead(405).end();
      return;
    }
    if (url.pathname === '/v1/explorer/transactions/stream') {
      observation.status = 200;
      streams.add(response);
      response.on('close', () => streams.delete(response));
      if (streamReleased) openStream(response);
      return;
    }
    if (url.pathname === '/v1/telemetry/live' || url.pathname === '/v1/explorer/blocks/stream') {
      observation.status = 204;
      response.writeHead(204).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    if (isCollectionRead && url.pathname === '/v1/explorer/transactions/latest/query') {
      latestRequests += 1;
      if (latestRequests === 1) {
        observation.status = 500;
        response.writeHead(500).end(JSON.stringify({ message: 'Controlled initial history failure' }));
        return;
      }
      observation.status = 200;
      response.end(JSON.stringify(tairaHistory.latestTransactions));
      return;
    }
    if (isCollectionRead && url.pathname === '/v1/explorer/blocks/query') {
      observation.status = 200;
      response.end(JSON.stringify(tairaHistory.blocks));
      return;
    }
    unexpectedRequests.push(`Unreviewed read: ${method} ${url.pathname}`);
    observation.status = 404;
    response.writeHead(404).end('{}');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests, unexpectedRequests,
    get latestRequests() { return latestRequests; },
    get connectedStreams() { return streams.size; },
    get openedStreams() { return openedStreams; },
    transactionEventsSent: 0,
    openTransactionStream() {
      streamReleased = true;
      for (const response of streams) if (!response.headersSent) openStream(response);
    },
    async close() {
      for (const response of streams) response.end();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    },
  };
}
