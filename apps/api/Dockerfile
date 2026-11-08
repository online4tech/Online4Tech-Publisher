FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
COPY . .
RUN pnpm install --no-frozen-lockfile
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/online4tech_publisher
RUN pnpm db:generate
EXPOSE 4000
CMD ["pnpm", "--filter", "@o4t/api", "exec", "tsx", "src/server.ts"]
