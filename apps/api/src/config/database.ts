import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;
let database: Db | undefined;

/**
 * Conecta a MongoDB. Si no se pasa `dbName`, se usa la base indicada en la ruta de la URI.
 */
export async function connectDB(uri: string, dbName?: string): Promise<void> {
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  database = client.db(dbName);
  await pingDatabase();
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

/** Hace un `ping` real al servidor; lanza error si no hay conexión. */
export async function pingDatabase(): Promise<void> {
  await getDatabase().command({ ping: 1 });
}

export async function closeDB(): Promise<void> {
  await client?.close();
  client = undefined;
  database = undefined;
}
