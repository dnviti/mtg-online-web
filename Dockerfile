# Use Node.js LTS (Alpine for smaller size)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package definition first to cache dependencies
COPY src/package.json src/package-lock.json ./

# Install dependencies
# Using npm install instead of ci to ensure updated package.json is respected
RUN npm install

# Copy the rest of the source code
# Copy the rest of the source code
COPY src/ ./

# Generate Prisma Client
RUN npx prisma generate

# Build the frontend (Production build)
RUN npm run build

# Remove development dependencies to keep image small
RUN npm prune --production

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
