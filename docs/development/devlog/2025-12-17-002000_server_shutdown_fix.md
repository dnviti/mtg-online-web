# Server Graceful Shutdown Fix

## Context
The user reported that the application process was not exiting clean (hanging for >5s) after pressing Ctrl+C. This indicated active handles (like intervals or open sockets) were preventing the Node.js process from terminating effectively.

## Changes
Modified `src/server/index.ts` to implement a proper graceful shutdown mechanism:
1.  **Interval Management**: Captured the global draft timer `setInterval` ID into a variable `draftInterval`.
2.  **Shutdown Handler**: Created a `gracefulShutdown` function that:
    - Clears the `draftInterval`.
    - Closes the Socket.IO server (`io.close()`).
    - Closes the HTTP server (`httpServer.close()`), waiting for existing connections to close, then exits with code 0.
    - Sets a 10-second timeout to force exit with code 1 if connections don't close in time.
3.  **Signal Listeners**: Attached `gracefulShutdown` to `SIGINT` and `SIGTERM` events.

## Impact
The server should now exit immediately and cleanly when stopped via the terminal, ensuring no zombie processes or port conflicts during development restarts.
