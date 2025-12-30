
import amqp, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { IQueueAdapter } from './IQueueAdapter';

export class RabbitMQAdapter implements IQueueAdapter {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnected = false;

  // RPC
  private replyQueue: string = '';
  private pendingRequests = new Map<string, { resolve: (data: any) => void, reject: (err: any) => void, timer: NodeJS.Timeout }>();

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const host = process.env.RABBITMQ_HOST || 'localhost';
      const port = process.env.RABBITMQ_PORT || '5672';
      const url = `amqp://${host}:${port}`;

      console.log(`[RabbitMQAdapter] Connecting to RabbitMQ at ${url}...`);

      this.connection = await amqp.connect(url) as any;
      // Force cast connection to any to assume createChannel exists (ignoring interface mismatch)
      this.channel = await (this.connection as any).createChannel();
      this.isConnected = true;

      // Setup RPC Reply Queue
      // Use ! non-null assertion as we just created channel
      const replyQ = await this.channel!.assertQueue('', { exclusive: true, autoDelete: true });
      this.replyQueue = replyQ.queue;

      this.channel!.consume(this.replyQueue, (msg) => this.handleRpcResponse(msg), { noAck: true });

      this.connection!.on('close', () => {
        console.error('[RabbitMQAdapter] Connection closed. Reconnecting...');
        this.isConnected = false;
        setTimeout(() => this.connect(), 5000);
      });

      this.connection!.on('error', (err: any) => {
        console.error('[RabbitMQAdapter] Connection error', err);
        this.isConnected = false;
      });

      console.log(`[RabbitMQAdapter] Connected. RPC Reply Queue: ${this.replyQueue}`);

    } catch (error) {
      console.error('[RabbitMQAdapter] Failed to connect', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  private handleRpcResponse(msg: ConsumeMessage | null) {
    if (!msg) return;
    const correlationId = msg.properties.correlationId;
    const pending = this.pendingRequests.get(correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(correlationId);
      try {
        const content = JSON.parse(msg.content.toString());
        if (content.error) {
          pending.reject(new Error(content.error));
        } else {
          pending.resolve(content.data);
        }
      } catch (e) {
        pending.reject(e);
      }
    }
  }

  async sendRPC(queueName: string, message: any, timeoutMs = 60000): Promise<any> {
    if (!this.channel || !this.replyQueue) await this.connect();
    if (!this.channel) throw new Error("Channel not available");

    const correlationId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(correlationId)) {
          this.pendingRequests.delete(correlationId);
          reject(new Error("RPC Timeout"));
        }
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timer });

      this.channel!.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
        correlationId,
        replyTo: this.replyQueue,
        persistent: false // RPC requests usually transient
      });
    });
  }

  private async replyRPC(msg: any, responseData: any) {
    if (!this.channel) return;
    const { replyTo, correlationId } = msg.properties;
    if (replyTo && correlationId) {
      this.channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ data: responseData })), {
        correlationId
      });
    }
  }

  async assertQueue(queueName: string): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');
    await this.channel.assertQueue(queueName, { durable: true });
  }

  async publish(queueName: string, message: any): Promise<boolean> {
    if (!this.channel) {
      console.warn('[RabbitMQAdapter] Channel not ready, attempting to connect...');
      await this.connect();
      if (!this.channel) return false;
    }
    await this.assertQueue(queueName);
    return this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), {
      persistent: true
    });
  }

  async consume(queueName: string, onMessage: (msg: any, rawMsg?: any) => Promise<any>) {
    if (!this.channel) await this.connect();
    if (!this.channel) return;

    await this.assertQueue(queueName);
    await this.channel.prefetch(1);

    this.channel.consume(queueName, async (msg) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          const result = await onMessage(content, msg);

          if (msg.properties.replyTo) {
            await this.replyRPC(msg, result);
          }

          this.channel!.ack(msg);
        } catch (e: any) {
          console.error(`[RabbitMQAdapter] Error processing message from ${queueName}`, e);
          if (msg.properties.replyTo) {
            if (this.channel) {
              const { replyTo, correlationId } = msg.properties;
              this.channel.sendToQueue(replyTo, Buffer.from(JSON.stringify({ error: e.message })), { correlationId });
            }
          }
          this.channel!.ack(msg);
        }
      }
    });

    console.log(`[RabbitMQAdapter] Consumer started for ${queueName}`);
  }
}
