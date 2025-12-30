
export interface IQueueAdapter {
  connect(): Promise<void>;
  assertQueue(queueName: string): Promise<void>;
  publish(queueName: string, message: any): Promise<boolean>;
  sendRPC(queueName: string, message: any, timeoutMs?: number): Promise<any>;
  consume(queueName: string, onMessage: (msg: any, rawMsg?: any) => Promise<any>): Promise<void>;
}
