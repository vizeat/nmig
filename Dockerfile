# syntax=docker/dockerfile:1

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine

WORKDIR /usr/src/app

# Copy source files into the image.
COPY . .

# Install dependencies, and build
RUN npm install && npm run build

ENTRYPOINT npm start
