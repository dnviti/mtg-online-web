# Migration to Node.js Backend

## Objective
Convert the project from a .NET backend to a Node.js (TypeScript) backend and remove the .NET infrastructure.

## Plan

### Phase 1: Structure Initialization
- [ ] Initialize `src` as a Node.js project (`package.json`, `tsconfig.json`).
- [ ] Create directory structure:
    - [ ] `src/server`: Backend logic.
    - [ ] `src/client`: Move existing React frontend here.
    - [ ] `src/shared`: Shared interfaces/types.

### Phase 2: React Frontend Migration
- [ ] Move `src/MtgDraft.Web/Client` contents to `src/client/src`.
- [ ] Move configuration files (`vite.config.ts`, `tailwind.config.js`, etc.) to `src/client` root or adjust as needed.
- [ ] Ensure frontend builds and runs via Vite (dev server).

### Phase 3: Node.js Backend Implementation
- [ ] Set up Express/Fastify server in `src/server/index.ts`.
- [ ] Configure Socket.IO foundations.
- [ ] Configure build scripts to build client and server.

### Phase 4: Verification
- [ ] Verify application runs with `npm run dev`.

### Phase 5: Cleanup
- [ ] Delete `MtgDraft.*` folders.
