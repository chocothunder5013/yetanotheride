FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Expose Vite port
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
