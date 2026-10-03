# Builds the demo (index, bench and GPU test pages) and serves it with nginx. The browser still needs WebGPU.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:demo

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/demo /usr/share/nginx/html
EXPOSE 80
