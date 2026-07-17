FROM node:25.2.1-alpine3.23
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build_prod
USER node
EXPOSE 8000