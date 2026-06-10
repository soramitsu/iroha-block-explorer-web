# Torii Explorer Availability Runbook

## Scope
- Explorer frontend reads from Torii (`/v1/explorer/*`, `/v1/telemetry/*`, `/status`, `/metrics`, `/peers`).
- This runbook covers sustained `5xx` periods (especially `502/503/504`) and frontend failover behavior.

## Primary Health Checks
- `GET /v1/explorer/health`
- `GET /v1/explorer/transactions?per_page=1`
- `GET /v1/explorer/instructions?per_page=1`
- `GET /v1/explorer/metrics`
- `GET /status`
- `GET /metrics`
- `GET /peers`

## Frontend Failover Policy
- Failure trigger: `5` transient failures within `60s`.
- Transient statuses: `502`, `503`, `504`, `522`, `524`, plus network errors.
- Candidate sources:
1. `toriiFailoverNodes` from runtime config.
2. Gossiped peers from `/peers` (probe `https://host:port` then `http://host:port`).
- Candidate selection:
1. Probe each candidate via `GET /v1/explorer/health`.
2. Keep healthy (`2xx`) candidates only.
3. Prefer highest probed head height, then newest head timestamp.
- Probe endpoint: `GET /v1/explorer/health`.
- Probe timeout: `1500ms` (default).
- Successful switch persists in local storage when `toriiFailoverPersistSwitch=true`.

## Runtime Config Knobs (`config.json`)
- `toriiFailoverEnabled` (default `true`)
- `toriiFailoverNodes` (array of base URLs)
- `toriiFailoverFailureThreshold` (default `5`)
- `toriiFailoverWindowMs` (default `60000`)
- `toriiFailoverProbeTimeoutMs` (default `1500`)
- `toriiFailoverPersistSwitch` (default `true`)
- `toriiFailoverMaxPeerCandidates` (default `16`)
- `toriiRequestTimeoutMs` (default `5000`)
- `toriiRequestRetryCount` (default `1`)
- `toriiRequestRetryBaseDelayMs` (default `200`)

## Suggested Alerts
- Error rate:
  - `sum(rate(torii_explorer_failures_total[5m])) by (endpoint) > 0.01 * sum(rate(torii_explorer_requests_total[5m])) by (endpoint)`
- Latency:
  - `histogram_quantile(0.95, sum(rate(torii_explorer_request_duration_seconds_bucket[5m])) by (le, endpoint)) > SLO`
- Availability:
  - `sum(rate(torii_explorer_requests_total{status=~"5.."}[5m])) by (endpoint) > 0`

## Immediate Operator Actions
1. Verify upstream Torii health checks above from the edge.
2. Confirm whether only one node is failing or network-wide issue exists.
3. If single-node failure, update `toriiBaseUrl` / `toriiFailoverNodes` to healthy nodes.
4. If all nodes unhealthy, surface outage status and disable aggressive retries until recovery.
5. After recovery, validate p95 latency and `5xx` rates returned to baseline.
