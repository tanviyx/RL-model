FROM node:20 AS base
WORKDIR /app

COPY package*.json ./
RUN npm install

# Self-signed certificate for the https dev server, baked into the image (no bind mount needed).
RUN mkdir -p /app/certs \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout /app/certs/localhost-key.pem -out /app/certs/localhost.pem \
      -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

COPY . .

# ---- runtime image (what docker compose runs) ----
FROM base AS runtime
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# ---- CI: lint (reported, does not block) ----
FROM base AS lint
RUN npm run lint

# ---- CI: production build must succeed ----
FROM base AS build
RUN npm run build