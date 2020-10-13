FROM node:lts-alpine
WORKDIR /app

RUN apk add --no-cache python3 libtool autoconf automake build-base

ADD . .
RUN yarn remove @ffmpeg-installer/ffmpeg @ffprobe-inst