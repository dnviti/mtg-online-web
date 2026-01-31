
import { IQueueAdapter } from './IQueueAdapter';

export class LocalQueueAdapter implements IQueueAdapter {
  private consumers = new Map<string, (msg: any, rawMsg?: any) => Promise<any>>();

  async connect(): Promise<void> {
    console.log('[LocalQueueAdapter] Ready (In-Memory)');
  }

  async assertQueue(_queueName: string): Promise<void> {
    // No-op for local
  }

  async publish(_queueName: string, message: any): Promise<boolean> {
    // Fire and forget
    const consumer = this.consumers.get(_queueName);
    if (consumer) {
      // Async execution to simulate queue
      setImmediate(async () => {
        try {
          await consumer(message);
        } catch (e) {
          console.error(`[LocalQueueAdapter] Consumer error on ${_queueName}`, e);
        }
      });
      return true;
    } else {
      console.warn(`[LocalQueueAdapter] No consumer for ${_queueName}, message dropped.`);
      return false;
    }
  }

  async sendRPC(queueName: string, message: any, _timeoutMs?: number): Promise<any> {
    // Direct call
    const consumer = this.consumers.get(queueName);
    if (!consumer) {
      throw new Error(`[LocalQueueAdapter] No consumer registered for ${queueName}`);
    }

    // Execute immediately and return result
    // Note: This blocks unless the consumer itself delegates to worker? 
    // Since this is "LocalQueueAdapter", it likely runs in SAME process.
    // If the consumer is CPU heavy (PackGen), it WILL block the event loop here.
    // For true non-blocking local fallback, we'd need Worker Threads.
    // But for "Simple" fallback or dev mode, this is acceptable if blocking is tolerated.
    // Or we can assume the consumer is async.

    return await consumer(message);
  }

  async consume(queueName: string, onMessage: (msg: any, rawMsg?: any) => Promise<any>): Promise<void> {
    if (this.consumers.has(queueName)) {
      console.warn(`[LocalQueueAdapter] Consumer already registered for ${queueName}, overwriting.`);
    }
    this.consumers.set(queueName, onMessage);
    console.log(`[LocalQueueAdapter] Consumer registered for ${queueName}`);
  }
}
