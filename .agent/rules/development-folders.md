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

* **Controllers:** `./src/modules/[ModuleName]/controllers/` (Handle HTTP requests).
* **Routes:** `./src/modules/[ModuleName]/routes/` (Define express/fastify routes).
* **DTOs:** `./src/modules/[ModuleName]/dtos/` (Data Transfer Objects for validation).
* **Static Assets:** `./src/public/` (for module-specific assets if necessary).

## Domain Layer
Shared business logic and database entities reside in shared directories or within the modules themselves, designed to be importable:

* **Entities:** `./src/modules/[ModuleName]/entities/` (ORM definitions, e.g., TypeORM/Prisma models).
* **Services:** `./src/modules/[ModuleName]/services/` (Business logic implementation).
* **Interfaces:** `./src/shared/interfaces/` or within the module (Type definitions).
