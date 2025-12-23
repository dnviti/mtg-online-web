---
trigger: always_on
---

## Documentation and Work Logging
You are required to use the `./docs/development/devlog` directory to track all work plans and their current status individually; within this directory, create logs using the strict filename format `yyyy-mm-dd-hh24miss_very_brief_description`. Additionally, use the `./docs/development` directory to maintain a summary `CENTRAL.md` file containing links to specific files within `./docs/development/devlog` alongside a brief synthesis of the development status.

## Source Code Organization
Use `./src` as the root for the monolithic **Node.js (TypeScript)** solution.
The project follows a **Modular Monolith** pattern. All backend logic is structured by modules, while frontend code (React) resides within a client directory or is served as static assets from the node application.

## Backend and Frontend Integration (The Monolith)
The core server project (e.g., `./src/server` or `./src/app`) contains the entry point (`index.ts` or `main.ts`). Functionality is divided into **Modules**:

## Cards Images folder
* **Cropped Art** `./src/server/public/cards/images/[set]/crop/
* **Standard Art** `./src/server/public/cards/images/[set]/full/

## Metadata folder
* **Card Metadata** `./src/server/public/cards/metadata/[set]/
* **Set Metadata** `./src/server/public/cards/sets/
