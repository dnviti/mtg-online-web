import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes'; // Imports index.ts from routes
import { initializeSocket } from './socket/socketManager';
import { persistenceManager } from './singletons';
import { RedisClientManager } from './managers/RedisClientManager';
import { fileStorageManager } from './managers/FileStorageManager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 1024 * 1024 * 1024,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1000mb' }));

// Persistence
persistenceManager.load();
const persistenceInterval = setInterval(() => {
  persistenceManager.save();
}, 5000);

// Initialize Socket
const { draftInterval } = initializeSocket(io);

// Static File Serving
const redisForFiles = RedisClientManager.getInstance().db1;
if (redisForFiles) {
  console.log('[Server] Using Redis for file serving');
  app.get('/cards/*', async (req: Request, res: Response) => {
    const relativePath = req.path;
    const filePath = path.join(__dirname, 'public', relativePath);
    const buffer = await fileStorageManager.readFile(filePath);
    if (buffer) {
      if (filePath.endsWith('.jpg')) res.type('image/jpeg');
      else if (filePath.endsWith('.png')) res.type('image/png');
      else if (filePath.endsWith('.json')) res.type('application/json');
      res.send(buffer);
    } else {
      res.status(404).send('Not Found');
    }
  });
} else {
  console.log('[Server] Using Local FS for file serving');
  app.use('/cards', express.static(path.join(__dirname, 'public/cards')));
}

app.use('/images', express.static(path.join(__dirname, 'public/images')));

// API Routes
app.use('/api', apiRoutes);

// Frontend Serving
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distPath));

  app.get('*', (_req: Request, res: Response) => {
    if (_req.path.startsWith('/api') || _req.path.startsWith('/socket.io')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Server Start
httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  import('os').then(os => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`  - Network IP: http://${iface.address}:${PORT}`);
        }
      }
    }
  });
});

// Graceful Shutdown
const gracefulShutdown = () => {
  console.log('Received kill signal, shutting down gracefully');
  clearInterval(draftInterval);
  clearInterval(persistenceInterval);
  persistenceManager.save();

  io.close(() => {
    console.log('Socket.io closed');
  });

  httpServer.close(() => {
    console.log('Closed out remaining connections');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
