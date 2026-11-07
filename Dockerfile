# Sentinel-AI — production image (no dependencies to install)
FROM node:22-alpine
WORKDIR /app
COPY server ./server
COPY public ./public
COPY sdk ./sdk
COPY examples ./examples
COPY package.json ./
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/data NODE_ENV=production
VOLUME ["/data"]
EXPOSE 8787
USER node
CMD ["node", "server/server.js"]
