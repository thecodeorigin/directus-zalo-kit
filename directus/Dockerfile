FROM directus/directus:latest

# Stay as node user to avoid pnpm store conflicts
USER node

WORKDIR /directus

# Enable corepack and install pnpm (as node user)
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install directus-extension-schema-sync (as node user)
RUN pnpm install directus-extension-schema-sync

# Create schema-sync directory (node user already has permissions)
RUN mkdir -p /directus/schema-sync