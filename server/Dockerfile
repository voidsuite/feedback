# Use the official Bun image
FROM oven/bun:1.2-slim AS base
WORKDIR /usr/src/app

# Install dependencies
FROM base AS install
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Final release image
FROM base AS release
COPY --from=install /usr/src/app/node_modules ./node_modules
COPY . .

# Expose the port Hono is running on
EXPOSE 3002

# Command to run the application
CMD [ "bun", "run", "start" ]
