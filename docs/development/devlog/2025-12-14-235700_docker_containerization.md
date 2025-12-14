# Docker Containerization and Build Fixes

## Objectives
- Create a Dockerfile to package the application as a monolith (Node.js + React).
- Fix TypeScript build errors preventing successful compilation.
- Verify the build process.

## Changes
- **Dockerfile**: Created multi-stage build using `node:20-alpine`.
    - Installs dependencies.
    - Builds frontend.
    - Prunes dev dependencies.
- **Server Entry (`src/server/index.ts`)**: Added logic to serve static `dist` files and handle client-side routing in production.
- **Package.json**: Moved `tsx` to dependencies and updated `start` script.
- **Code Fixes**: Removed unused variables in client and server code used to satisfy strict TypeScript rules:
    - `DeckBuilderView.tsx`: Removed unused `payload`.
    - `DraftView.tsx`: Removed unused `CardComponent`.
    - `GameView.tsx`: Removed unused `myCommand`, `oppGraveyard`.
    - `DraftManager.ts`: Removed unused `numPlayers`, `cardIndex`.
    - `GameManager.ts`: Renamed unused args in `shuffleLibrary`.
- **Helm Chart**: Created a complete Helm chart configuration in `helm/mtg-draft-maker`:
    - `Chart.yaml`: Defined chart metadata.
    - `values.yaml`: Configured defaults (Image `git.commandware.com/services/mtg-online-drafter:main`, Port 3000).
    - `templates/`: Added Deployment, Service, Ingress, and ServiceAccount manifests.
    - **Persistence**: Added configuration to mount a Persistent Volume Claim (PVC) at `/app/server/public/cards` for storing cached images. Disabled by default.
    - Linted successfully.

## Status
- Docker build successful (`docker build -t mtg-draft-maker .`).
- Helm chart created and linted.
- Ready for K8s deployment.
