
import { IQueueAdapter } from './queue/IQueueAdapter';
import { RabbitMQAdapter } from './queue/RabbitMQAdapter';
import { LocalQueueAdapter } from './queue/LocalQueueAdapter';

export class QueueManager {
  private static instance: QueueManager;
  private adapter: IQueueAdapter;

  private constructor() {
    const useRabbit = process.env.USE_RABBITMQ === 'true';
    if (useRabbit) {
      console.log('[QueueManager] Initializing RabbitMQ Adapter');
      this.adapter = new RabbitMQAdapter();
    } else {
      console.log('[QueueManager] Initializing Local Queue Adapter');
      this.adapter = new LocalQueueAdapter();
    }
  }

  public static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  async connect(): Promise<void> {
    return this.adapter.connect();
  }

  async assertQueue(queueName: string): Promise<void> {
    return this.adapter.assertQueue(queueName);
  }

  async publish(queueName: string, message: any): Promise<boolean> {
    return this.adapter.publish(queueName, message);
  }

  async sendRPC(queueName: string, message: any, timeoutMs?: number): Promise<any> {
    return this.adapter.sendRPC(queueName, message, timeoutMs);
  }

  async consume(queueName: string, onMessage: (msg: any, rawMsg?: any) => Promise<any>): Promise<void> {
    return this.adapter.consume(queueName, onMessage);
  }
}
