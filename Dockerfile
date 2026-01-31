# Use Node.js LTS (Alpine for smaller size)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk -U upgrade && apk add --no-cache openssl

# Copy package definition first to cache dependencies
COPY src/package.json src/package-lock.json ./

# Install dependencies
# Using npm install instead of ci to ensure updated package.json is respected
RUN npm install

# Copy the rest of the source code
COPY src/ ./

# Build the frontend (Production build)
RUN npm run build

# Remove development dependencies to keep image small
RUN npm prune --production

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
