---
trigger: always_on
---

## Planning and Workflow
You must always start by producing an implementation plan in the dedicated folders and proposing to the user that they view it by default. If the user chooses to proceed, you are to continue with the implementation of the plan without stopping. It is essential that you update the plan continuously as the development progresses to reflect the current state of the project.

## Code Philosophy and Integration
You are required to work with the existing code, specifically utilizing the logic found in the provided gemini-generated.js file—including its regex parsing, Scryfall data fetching, caching strategies, and pack generation algorithms—as the core of the "Draft Preparation Phase". You must refactor this monolithic component into modular services, such as a `CardParserService` and `PackGeneratorService`, to effectively separate the user interface from the business logic, making the system suitable for a multiplayer backend state. The software must be extremely optimized and easy to use; while the preparation phase happens on the client side, the live draft state must be synchronized via the backend. The average user, acting as the Draft Host, must be guided through every operation, from uploading a list and fetching data to configuring packs and opening a lobby for multiplayer.

## UI/UX Design and Tech Stack
The graphics must be professional, immersive, and reassuring, utilizing a dark mode or gaming theme that replicates the visual style of the provided file (using Tailwind and Lucide icons) while elevating it to a production standard. The interface must include shortcuts for quick usage, and data saving must be immediate without requiring the user to click "Save" buttons. You must implement the specific views found in the provided code, including List View, Grid View, and the 3D perspective Stack View, ensuring they work seamlessly in a multiplayer context. The development will utilize **React** for the frontend, reusing component logic like `StackView` and `PackCard`, and **Node.js with TypeScript** for the backend. You must use **Socket.IO** to handle the real-time multiplayer draft state for synchronizing pack passing between clients, and the frontend generator must produce a JSON object of packs to be sent to the backend to initialize the session.

## Documentation and Architecture
For every implementation, update, or modification request, you must create a detailed work plan to be followed strictly. If a request implies complex development, such as synchronizing drag-and-drop actions across multiple clients, you must warn the user beforehand. Before starting, always write a file dedicated to the request and the created plan within the `./docs/development` folder, and keep this file updated throughout the execution of the work plan. The platform must be organized into applications managed via a sidebar, such as the Cube Manager (using the adapted logic), Lobby Manager, and Live Draft interface. Each application must be toggleable and purchasable via an internal administration section.

## Design System, Navigation, and Viewport
Interfaces must always be created using Material Design principles adapted for a dark gaming UI, with icons that clearly identify the purpose of the application or function. The interface must be fully responsive, with specific handling for mobile devices, such as converting the "Stack View" to a "Swipe View" where necessary. The menu must be a lateral sidebar with two levels: the first for active applications and the second for functions within those applications. A top search bar must be implemented as an accelerator to search for cards, players, or lobbies hierarchically. The main viewport must be configurable with tabs; every application opens as a new tab, and upon restarting, the tabs open last time must remain active. Specifically, starting a draft should open a new tab for the "Live Lobby," and the system must handle persistence to reconnect users to their active session upon reloading.

## Localization, Database, and Error Handling
The management system is currently supporting English only.
