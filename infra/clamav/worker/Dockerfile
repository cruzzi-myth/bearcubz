FROM node:24-alpine AS runtime
RUN apk add --no-cache python3
WORKDIR /app
COPY --chown=node:node infra/clamav/worker/ /app/infra/clamav/worker/
COPY --chown=node:node infra/clamav/clamd.conf /app/infra/clamav/clamd.conf
COPY --chown=node:node infra/clamav/healthcheck.mjs /app/infra/clamav/healthcheck.mjs
COPY --chown=node:node supabase/functions/_shared/attachmentSafety.ts /app/supabase/functions/_shared/attachmentSafety.ts
COPY --chown=node:node supabase/functions/_shared/zipValidation.ts /app/supabase/functions/_shared/zipValidation.ts
COPY --chown=node:node supabase/functions/_shared/clamavPolicy.ts /app/supabase/functions/_shared/clamavPolicy.ts
USER node
CMD ["node", "infra/clamav/worker/server.mjs"]

# Opt-in fixtures; ffmpeg is not part of the worker runtime.
FROM runtime AS diagnostics
USER root
RUN apk add --no-cache ffmpeg
COPY --chown=node:node infra/clamav/tests/genuine.test.mjs /app/infra/clamav/tests/genuine.test.mjs
USER node
CMD ["node", "--test", "infra/clamav/tests/genuine.test.mjs"]
