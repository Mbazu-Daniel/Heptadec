FROM node:22-bookworm-slim AS deps
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile

FROM deps AS web-build
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/db packages/db
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter @heptadec/web run build

FROM node:22-bookworm-slim AS api
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --prod
COPY packages/db packages/db
COPY apps/api apps/api
EXPOSE 8787
CMD ["sh", "-c", "pnpm --filter @heptadec/db run migrate && exec pnpm --filter @heptadec/api run start"]

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
