FROM node:24-slim
WORKDIR /app/client
COPY . .
RUN rm -rf node_modules package-lock.json && npm i
EXPOSE 5173
CMD ["npm", "run", "dev"]