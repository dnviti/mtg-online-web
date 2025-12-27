# Fix Docker OpenSSL Issue

## Context
The Docker container failed to run due to Prisma warning:
`prisma:warn Prisma failed to detect the libssl/openssl version to use`

## Changes
1. **Dockerfile**: Added `RUN apk -U upgrade && apk add --no-cache openssl` to install OpenSSL in the Alpine image.
2. **src/prisma/schema.prisma**: Added `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` to the `client` generator to explicitly support the Alpine environment.

## Next Steps
- Rebuild the Docker image: `docker-compose build --no-cache`
- Restart the container: `docker-compose up -d`
