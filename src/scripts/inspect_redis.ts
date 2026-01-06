
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
// Assuming running from root, so .env is in same dir as execution or just use path relative to this file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function inspect() {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  console.log(`Connecting to Redis at ${host}:${port} DB 1...`);
  const redis = new Redis({
    host,
    port,
    db: 1
  });

  try {
    const keys = await redis.keys('*');
    console.log(`Found ${keys.length} keys in DB 1.`);

    // Sample a few keys
    const sampleKeys = keys.slice(0, 5);
    for (const key of sampleKeys) {
      console.log(`\nKey: ${key}`);
      const type = await redis.type(key);
      console.log(`Type: ${type}`);

      if (type === 'hash') {
        const value = await redis.hgetall(key);
        console.log('Value:', value);
      } else if (type === 'string') {
        const value = await redis.get(key);
        console.log('Value:', value);
      }
    }

    // Check for a specific set key pattern if any
    const setKeys = keys.filter(k => k.startsWith('set:'));
    if (setKeys.length > 0) {
      console.log(`\nFound ${setKeys.length} set keys.`);
      console.log(`First 3 set keys: ${setKeys.slice(0, 3)}`);
      // Inspect one
      const sampleSetKey = setKeys[0];
      const fields = await redis.hkeys(sampleSetKey);
      console.log(`Fields in ${sampleSetKey}: ${fields.length} (showing first 3)`);
      for (const field of fields.slice(0, 3)) {
        const val = await redis.hget(sampleSetKey, field);
        console.log(`Field ${field}:`, val);
      }
    } else {
      console.log('\nNo keys starting with "set:" found.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    redis.disconnect();
  }
}

inspect();
