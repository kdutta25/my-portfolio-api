# Node 20 matches my-portfolio GitHub Actions; slim image for ECS / App Runner / ECR.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY data ./data

USER node

# Default; AWS App Runner and many platforms set PORT at runtime (often 8080).
ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/server.mjs"]
