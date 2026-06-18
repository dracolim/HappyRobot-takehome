FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace manifests (all three so npm workspaces resolves correctly)
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all workspace deps (hoists tsup, typescript, etc. to /app/node_modules)
RUN npm install

# Copy source and build
COPY shared/src ./shared/src
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
WORKDIR /app/backend
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./
# @happyrobot/shared is bundled by esbuild — remove it so prod install doesn't need workspaces
RUN npm pkg delete dependencies["@happyrobot/shared"] && npm install --omit=dev --ignore-scripts
EXPOSE 8080
CMD ["node", "dist/index.js"]
