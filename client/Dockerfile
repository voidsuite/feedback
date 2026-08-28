FROM oven/bun:1.2-slim
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

EXPOSE 5173

CMD ["bun", "run", "dev", "--host"]