FROM node:24-alpine
WORKDIR /app/server
COPY . .
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "dev"]