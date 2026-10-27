FROM node:20 AS base
WORKDIR /app

COPY package*.json ./
RUN npm install

# Self-signed certificate for https://localhost, baked into the image. No bind mount is needed,
# which also makes it work when the build runs inside the Jenkins container.
RUN mkdir -p /app/certs \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout /app/certs/localhost-key.pem -out /app/certs/localhost.pem \
      -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

COPY . .

# ---- runtime image (what docker compose runs) ----
FROM base AS runtime
EXPOSE 5000
CMD ["npm", "start"]

# ---- CI: unit tests + policy gate (docker build --target test ./server) ----
FROM base AS test
RUN npm test
RUN if [ -f config/demand.json ]; then \
      node tools/evaluate.mjs --scale 3 --gate && node tools/evaluate.mjs --scale 5 --gate; \
    else \
      echo "config/demand.json not found - skipping the policy gate"; \
    fi