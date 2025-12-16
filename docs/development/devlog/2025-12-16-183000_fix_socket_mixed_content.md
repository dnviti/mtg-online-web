# Fix Socket Mixed Content Error

## Objective
Resolve the "Mixed Content" error preventing the Online Lobby and Deck Tester from functioning in the production Kubernetes environment. The application was attempting to connect to an insecure HTTP endpoint (`http://...:3000`) from a secure HTTPS page.

## Changes
- **Client Socket Service**: Modified `client/src/services/SocketService.ts` to make the connection URL environment-aware.
    - In **Production**: The URL is now `undefined`, allowing Socket.IO to automatically detect the current protocol (HTTPS) and domain (via Ingress), avoiding mixed content blocks.
    - In **Development**: It retains the explicit `http://localhost:3000` (or hostname) to ensure connectivity during local development.
- **TypeScript Config**: Added a reference directive `/// <reference types="vite/client" />` to `SocketService.ts` to ensure `import.meta.env` is correctly typed during the build.

## Verification
- Validated that `npm run build` succeeds without TypeScript errors.
- Confirmed that the fix aligns with standard Vite + Socket.IO production deployment patterns.
