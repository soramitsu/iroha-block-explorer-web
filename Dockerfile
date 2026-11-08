FROM node:24.19.0-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder

WORKDIR /app

ENV COREPACK_DEFAULT_TO_LATEST=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_ENABLE_NETWORK=1 \
    COREPACK_ENABLE_PROJECT_SPEC=1 \
    COREPACK_ENABLE_STRICT=1 \
    COREPACK_ENABLE_UNSAFE_CUSTOM_URLS=0 \
    COREPACK_ENV_FILE=0 \
    COREPACK_USE_LATEST=0

RUN test "$(node --version)" = "v24.19.0" \
  && corepack enable \
  && corepack install --global "pnpm@10.11.0+sha512.6540583f41cc5f628eb3d9773ecee802f4f9ef9923cc45b69890fb47991d4b092964694ec3a4f738a420c918a333062c8b925d312f42e4f0c263eb603551f977" \
  && test "$(pnpm --version)" = "10.11.0"

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY scripts/verify-iroha-sdk.mjs scripts/verify-iroha-sdk.mjs
COPY vendor vendor
RUN node scripts/verify-iroha-sdk.mjs --archive-only
RUN pnpm fetch --frozen-lockfile

COPY src src
COPY public public
COPY scripts scripts
COPY tests tests
COPY ops ops
COPY *.json *.ts *.cjs *.mts *.html ./
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build

FROM caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /srv

RUN adduser -D -g '' caddy \
  && mkdir -p /data/caddy /config/caddy \
  && chown -R caddy /data/caddy /config/caddy
USER caddy

EXPOSE 8080

# This image serves only the static SPA; the Caddyfile has no runtime backend settings.
