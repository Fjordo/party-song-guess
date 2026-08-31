# better-sqlite3 is a native module: build it in a throwaway stage so the
# toolchain does not ship in the final image, which now also matters for
# wake-up latency since the machine scales to zero.
FROM node:26-alpine AS build
WORKDIR /app/server
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci --omit=dev

FROM node:26-alpine
WORKDIR /app/server
COPY --from=build /app/server/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
