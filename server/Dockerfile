FROM node:20-bookworm-slim
# Python + biblioteca iqoptionapi para a ponte da IQ Option (opcional; sem IQ_EMAIL ela nem inicia)
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --break-system-packages requests "websocket-client==0.56" "git+https://github.com/iqoptionapi/iqoptionapi.git"
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
CMD ["node", "server.js"]
