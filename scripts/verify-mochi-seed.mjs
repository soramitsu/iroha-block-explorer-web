#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPLORER_WORKSPACE_ROOT,
  loadMochiProfile,
} from './mochi-explorer.mjs';

export function localToriiBaseUrl(value) {
  const url = new URL(value);
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (!loopback || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(`Refusing non-local Mochi Torii URL: ${url.toString()}`);
  }
  url.pathname = url.pathname.replace(/\/+$/u, '');
  url.search = '';
  url.hash = '';
  return url;
}

export function mochiSessionPath(workspaceRoot, profileSlug) {
  if (!profileSlug || profileSlug.includes('/') || profileSlug.includes('..')) {
    throw new Error('Invalid Mochi profile slug');
  }
  return resolve(workspaceRoot, '.mochi', 'sandbox', profileSlug, 'session.json');
}

async function requiredJson(response, label) {
  if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error(`${label} did not return application/json`);
  }
  return await response.json();
}

export async function verifyExplorerMochiSeed({ profile, session, fetchImpl = fetch }) {
  if (session.ready !== true || session.mcp_ready !== true) {
    throw new Error('Mochi session is not ready with its curated MCP surface');
  }
  if (session.chain_id !== profile.chain_id) {
    throw new Error(`Mochi chain id mismatch: expected ${profile.chain_id}, found ${String(session.chain_id)}`);
  }
  if (
    !Number.isSafeInteger(profile.seed.minimum_transactions)
    || profile.seed.minimum_transactions < 1
    || profile.seed.minimum_transactions > 100
  ) {
    throw new Error('Mochi minimum transaction seed must be between 1 and 100');
  }
  const baseUrl = localToriiBaseUrl(session.torii_url);
  const headers = {
    Accept: 'application/json',
  };
  const request = (path) => fetchImpl(new URL(path, baseUrl), { cache: 'no-store', headers });
  const [healthResponse, domainResponse, transactionsResponse] = await Promise.all([
    request('/v1/explorer/health'),
    request(`/v1/explorer/domains/${encodeURIComponent(profile.seed.domain_id)}`),
    request(`/v1/explorer/transactions?limit=${profile.seed.minimum_transactions}`),
  ]);
  const [health, domain, transactions] = await Promise.all([
    requiredJson(healthResponse, 'Explorer health'),
    requiredJson(domainResponse, 'Seed domain'),
    requiredJson(transactionsResponse, 'Seed transactions'),
  ]);
  if (!Number.isSafeInteger(health.head_height) || health.head_height < profile.seed.minimum_head_height) {
    throw new Error(`Explorer head height ${String(health.head_height)} is below the deterministic seed floor`);
  }
  if (domain.id !== profile.seed.domain_id) {
    throw new Error(`Seed domain mismatch: expected ${profile.seed.domain_id}, found ${String(domain.id)}`);
  }
  const observedTransactions = Array.isArray(transactions?.items) ? transactions.items.length : null;
  if (observedTransactions === null || observedTransactions < profile.seed.minimum_transactions) {
    throw new Error(`Explorer transaction sample ${String(observedTransactions)} is below the deterministic seed floor`);
  }
  return {
    chainId: session.chain_id,
    headHeight: health.head_height,
    domainId: domain.id,
    transactionCount: observedTransactions,
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const profile = loadMochiProfile();
    const sessionPath = mochiSessionPath(EXPLORER_WORKSPACE_ROOT, profile.profile_slug);
    const session = JSON.parse(readFileSync(sessionPath, 'utf8'));
    const report = await verifyExplorerMochiSeed({ profile, session });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
