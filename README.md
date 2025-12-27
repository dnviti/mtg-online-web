# MTGate

A monolithic Node.js application designed to simulate Magic: The Gathering drafts with multiplayer support. This project aims to bridge the gap between utilitarian management tools and immersive, game-like user experiences for drafting.

## Features

- **Draft Simulation**: Simulate realistic draft environments.
- **Multiplayer Support**: synchronous drafting with multiple players via Socket.IO.
- **Cube Manager**: Parse lists, fetch metadata, and generate packs.
- **Immersive UI**: Dark mode, gaming-themed interface built with React and Tailwind CSS.
- **Robust Backend**: Node.js monolith managing draft state and synchronization.

## Technology Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Express, Socket.IO
- **Database**: Prisma (ORM), Redis (Caching/Session)
- **Utilities**: `dnd-kit` (Drag & Drop), `lucide-react` (Icons)

## Getting Started

### Prerequisites

Ensure you have the following installed on your system:
- **Node.js** (Latest LTS recommended)
- **npm** (comes with Node.js)
- **Redis** (for session/caching - ensure the service is running)
- **Database** (PostgreSQL/SQLite as configured in your `.env` and Prisma schema)

### Installation

1.  Navigate to the source directory:
    ```bash
    cd src
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up environment variables:
    - Copy `.env.example` to `.env`.
    - Update the variables as needed (database URL, secrets, etc.).

4.  Initialize the database:
    ```bash
    npx prisma generate
    npx prisma db push
    ```

### Running the Application

To start the development server (runs both client and server concurrently):

```bash
npm run dev
```

The application should now be accessible at the local address provided by Vite (usually `http://localhost:5173`).

## Scripts

All scripts are run from the `src` directory.

-   `npm run dev`: Starts both the backend server and frontend client in development mode.
-   `npm run server`: runs the backend server with `tsx watch`.
-   `npm run client`: runs the frontend client with `vite`.
-   `npm run build`: Compiles TypeScript and builds the frontend for production.
-   `npm run start`: Starts the application in production mode.

## Project Structure

-   `src/client`: Frontend React application.
-   `src/server`: Backend Node.js/Express application.
-   `src/prisma`: Database schema and migrations.
-   `docs`: Project documentation and development logs.
