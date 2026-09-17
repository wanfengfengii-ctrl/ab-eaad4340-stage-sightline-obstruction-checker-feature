# syntax=docker/dockerfile:1

# 公共依赖层：PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD 避免安装时下载浏览器（e2e 不在镜像内运行）
FROM node:22-alpine AS base
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 一次性验收：类型检查 + Vitest 单元测试 + 生产构建，任一失败即非零退出
FROM base AS verify
COPY . .
CMD ["npm", "run", "verify"]

# 构建静态产物
FROM base AS build
COPY . .
RUN npm run build

# 仅承载静态 Web
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
