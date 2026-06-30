FROM node:22-alpine AS deps
WORKDIR /app

# alpine apk 换 aliyun 源
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

COPY package.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# standalone 模式:复制必要的 node_modules + .next/standalone
# 容器内 public 目录可能不存在,先建一个空目录
RUN mkdir -p ./public
COPY --from=builder /app/public/ ./public/
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
CMD ["node", "server.js"]
