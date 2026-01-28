# Stage 1: Build the React App
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# IMPORTANT: This builds the static HTML/CSS/JS files
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
# Copy the built files from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html
# Copy custom Nginx config (we will create this next)
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]