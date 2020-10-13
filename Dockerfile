FROM node:lts-alpine
WORKDIR /app

RUN apk add --no-cache python3 libtool autoconf automake build-base

ADD . .
RUN yarn remove @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe && yarn build || true && rm -rf node_modules && yarn --production

FROM node:lts-alpine
WORKDIR /app
ENV NODE_ENV=prod