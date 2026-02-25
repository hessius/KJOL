# Stage 1: Build the frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy frontend package files and install
COPY package.json package-lock.json* ./
RUN npm install

# Copy frontend source and build
COPY index.html vite.config.js eslint.config.js ./
COPY src/ src/
COPY public/ public/
RUN npm run build

# Stage 2: Production image with backend + built frontend
FROM node:20-alpine AS production

WORKDIR /app

# Copy backend package files and install
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --production

# Copy backend source
COPY backend/server.js backend/db.js ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/dist ./dist

# Create data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/kjol.json
ENV DIST_PATH=/app/dist

EXPOSE 3000

CMD ["node", "server.js"]
