# 构建前端静态产物（需要 npm / node）
FROM node:22-alpine AS builder
WORKDIR /app

# Vite 在构建时把 VITE_* 环境变量内联进产物，必须通过 --build-arg 传入
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

# 构建期校验：缺环境变量直接失败，避免生成坏的 dist
RUN test -n "$VITE_SUPABASE_URL" \
 && test -n "$VITE_SUPABASE_PUBLISHABLE_KEY"

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY public/ public/
COPY src/ src/
COPY scripts/ scripts/
RUN npm run build

# 导出阶段：配合 `docker build --output type=local` 把 dist 直接落盘到宿主机
FROM scratch AS export
COPY --from=builder /app/dist /dist