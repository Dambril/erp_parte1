import { MongoClient, MongoError, type ClientSession, type Db } from 'mongodb';

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

/**
 * Error que el código de la aplicación lanza dentro de una transacción para pedir un reintento
 * (p. ej. dos transacciones que crean a la vez el mismo documento con upsert y chocan en un índice único).
 */
export class TransactionConflictError extends Error {
  public constructor(message = 'Concurrent write conflict') {
    super(message);
    this.name = 'TransactionConflictError';
  }
}

const MAX_TRANSACTION_ATTEMPTS = 25;

function hasLabel(error: unknown, label: string): boolean {
  return error instanceof MongoError && error.hasErrorLabel(label);
}

function isRetryable(error: unknown): boolean {
  return error instanceof TransactionConflictError || hasLabel(error, 'TransientTransactionError');
}

const backoff = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.min(200, 5 * attempt) + Math.random() * 10 * attempt));

/**
 * Ejecuta `work` en una transacción (lecturas y escrituras con `session`). Reintenta la transacción completa
 * ante errores transitorios (conflictos de escritura, elecciones) y el commit ante un resultado desconocido.
 * Cualquier otro error aborta y se propaga: no queda ninguna escritura.
 */
export async function withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  if (!client) throw new Error('Database is not connected');
  const session = client.startSession();
  try {
    for (let attempt = 1; ; attempt++) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      let result: T;
      try {
        result = await work(session);
      } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        if (isRetryable(error) && attempt < MAX_TRANSACTION_ATTEMPTS) {
          await backoff(attempt);
          continue;
        }
        throw error;
      }
      try {
        await commitWithRetry(session);
        return result;
      } catch (error) {
        if (hasLabel(error, 'TransientTransactionError') && attempt < MAX_TRANSACTION_ATTEMPTS) {
          await backoff(attempt);
          continue;
        }
        throw error;
      }
    }
  } finally {
    await session.endSession();
  }
}

async function commitWithRetry(session: ClientSession): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await session.commitTransaction();
      return;
    } catch (error) {
      if (hasLabel(error, 'UnknownTransactionCommitResult') && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
      throw error;
    }
  }
}

export async function closeDB(): Promise<void> {
  await client?.close();
  client = undefined;
  database = undefined;
}
