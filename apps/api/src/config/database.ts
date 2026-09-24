import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;
let database: Db | undefined;

export async function connectDB(uri: string): Promise<void> {
  client = new MongoClient(uri);
  await client.connect();
  database = client.db();
}

export function getDatabase(): Db {
  if (!database) {
    throw new Error('Database is not connected');
  }
  return database;
}

export function isDatabaseConnected(): boolean {
  return database !== undefined;
}

export async function closeDB(): Promise<void> {
  await client?.close();
  client = undefined;
  database = undefined;
}
