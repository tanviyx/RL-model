# Backend image (Express API + the static frontend it serves).
# Build from the repo root:  docker build -f backend/Dockerfile -t smartsignal-backend .
# server.js serves ../frontend and routes/traffic.js reads ../model/results/baseline_real_eval.csv,
# so the image keeps the same folder layout as the repo: /app/backend, /app/frontend, /app/model.

# ---- production dependencies only ----
FROM node:20-alpine AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---- test target: everything + dev dependencies; run by Jenkins against the model container ----
FROM node:20-alpine AS test
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/ ./
COPY frontend/ /app/frontend/
COPY model/results/baseline_real_eval.csv /app/model/results/baseline_real_eval.csv
ENV AI_SERVICE_URL=http://model:5001
CMD ["node", "test/api.test.js"]

# ---- React production build ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- runtime ----
FROM node:20-alpine AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app/backend
COPY --from=deps /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
COPY frontend/public/js/simulation.js /app/frontend/public/js/simulation.js
COPY model/results/baseline_real_eval.csv /app/model/results/baseline_real_eval.csv
RUN rm -rf test test-mail.js && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=6 --start-period=20s \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server.js"]