
import 'dotenv/config';
import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import passport from 'passport';
import apiRoutes from './routes'; // Imports index.ts from routes
import { initializeSocket } from './socket/socketManager';
import { fileStorageManager } from './managers/FileStorageManager';
import cluster from 'cluster';
import os from 'os';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { QueueManager } from './managers/QueueManager';
import { packGeneratorService } from './singletons';
import { imageCacheService } from './services/ImageCacheService';
import { configurePassport } from './config/passport';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const numCPUs = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`[Master] Primary ${process.pid} is running`);
  console.log(`[Master] Forking ${numCPUs} workers...`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, _code, _signal) => {
    console.log(`[Master] Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

} else {
  // WORKER PROCESS
  console.log(`[Worker] Worker ${process.pid} started`);

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 1024 * 1024 * 1024,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Setup Redis Adapter (Conditional)
  if (process.env.USE_REDIS === 'true') {
    const pubClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true
    });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      console.log(`[Worker ${process.pid}] Redis Adapter configured`);
    }).catch(err => {
      // ioredis connects automatically often, but explicit call helps ensure readiness
      console.log(`[Worker ${process.pid}] Redis Adapter Connection (Explicit) threw error or already connecting`, err);
      io.adapter(createAdapter(pubClient, subClient));
    });
  } else {
    console.log(`[Worker ${process.pid}] Running without Redis Adapter (Single Node / No Cluster Sync)`);
  }

  const PORT = process.env.PORT || 3000;

  // Stripe webhook needs raw body for signature verification
  // This must be BEFORE express.json() middleware
  app.post('/api/payment/stripe/webhook',
    express.raw({ type: 'application/json' }),
    (await import('./controllers/payment.controller')).PaymentController.handleWebhook
  );

  app.use(express.json({ limit: '1000mb' }));

  // Session middleware (required for Passport)
  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  }));

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());
  configurePassport();

  // Initialize Socket
  initializeSocket(io);

  // Middleware for Image Caching (Redis DB1 Metadata + Local FS)
  // Intercept /cards/images/:set/:type/:id.jpg
  // This must be BEFORE the generic file serving or static middleware if they overlap.
  // The generic one is app.get('/cards/*', ...) which is what we want to replace/augment.

  app.get('/cards/images/:set_code/:type/:filename', async (req: Request, res: Response) => {
    const { set_code, type, filename } = req.params;
    const cardId = filename.replace(/\.(jpg|png|jpeg)$/, '');
    const relativePath = req.path;
    const absPath = path.join(__dirname, 'public', relativePath);

    // Only handle 'full' and 'crop' for efficiency
    if (type !== 'full' && type !== 'crop') return res.status(404).send('Invalid image type');

    try {
      // Use ImageCacheService to ensure it's in Redis Metadata and Local FS
      const buffer = await imageCacheService.ensureImageCached(absPath, cardId, set_code, type as 'full' | 'crop');
      if (buffer) {
        res.type('image/jpeg');
        res.send(buffer);
      } else {
        res.status(404).send('Not found');
      }
    } catch (e) {
      console.error("Error serving image", e);
      res.status(500).send('Error');
    }
  });

  // Generic File Serving (Local FS via FileStorageManager)
  // This catches things in /cards/ that are NOT matched above,
  // OR if the regex/params above didn't match (though :set/:type/:filename is broad).
  app.get('/cards/*', async (req: Request, res: Response) => {
    const relativePath = req.path;
    const filePath = path.join(__dirname, 'public', relativePath);
    // Fallback to static serving or FileStorageManager (which is FS now)
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

  app.use('/images', express.static(path.join(__dirname, 'public/images')));

  // Dynamic ads.txt for AdSense verification (loaded from env var to keep ID private in open source)
  app.get('/ads.txt', (_req: Request, res: Response) => {
    const adsTxtContent = process.env.ADSENSE_ADS_TXT;
    if (!adsTxtContent) {
      return res.status(404).send('# ads.txt not configured - set ADSENSE_ADS_TXT in .env');
    }
    res.type('text/plain').send(adsTxtContent);
  });

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
  httpServer.listen(Number(PORT), () => {
    // console.log(`Worker ${process.pid} listening on port ${PORT}`);
  });

  // Setup Job Consumer
  QueueManager.getInstance().consume('generate_packs', async (data) => {
    if (process.env.DEBUG_QUEUE) console.log(`[Worker ${process.pid}] Processing pack generation job...`);
    const { pools, sets, settings, numPacks } = data;
    try {
      const packs = packGeneratorService.generatePacks(pools, sets, settings, numPacks);
      return packs;
    } catch (e) {
      console.error(`[Worker ${process.pid}] Pack Generation Job Failed`, e);
      throw e;
    }
  });

  // Graceful Shutdown
  const gracefulShutdown = () => {
    console.log(`[Worker ${process.pid}] Received kill signal`);
    // cleanup
    io.close(() => {
      console.log('Socket.io closed');
    });

    httpServer.close(() => {
      process.exit(0);
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}
