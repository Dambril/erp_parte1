import { MongoServerError, type ClientSession, type Collection, type Db } from 'mongodb';
import { TransactionConflictError } from '../config/database';

export const COUNTERS_COLLECTION = 'counters';

export interface CounterDocument {
  _id: string;
  tenantId: string;
  series: string;
  value: number;
}

/** `formatFolio('OBR', 1)` → `"OBR-000001"`. */
export function formatFolio(series: string, value: number): string {
  return `${series}-${String(value).padStart(6, '0')}`;
}

/** Folios consecutivos por serie y tenant. Solo se puede avanzar: no hay forma de reiniciar ni de saltar un valor. */
export class CountersRepository {
  public constructor(private readonly collection: Collection<CounterDocument>) {}

  /**
   * Siguiente folio de la serie. Se llama dentro de la transacción del documento que lo usa: si esta aborta,
   * el incremento también se revierte y no quedan huecos.
   */
  async next(tenantId: string, series: string, session: ClientSession): Promise<string> {
    if (!tenantId) throw new Error('tenantId is required for repository queries');
    try {
      const counter = await this.collection.findOneAndUpdate(
        { tenantId, series },
        { $inc: { value: 1 }, $setOnInsert: { _id: `${tenantId}:${series}` } },
        { upsert: true, returnDocument: 'after', session },
      );
      if (!counter) throw new Error('Counter upsert returned no document');
      return formatFolio(series, counter.value);
    } catch (error) {
      // Dos transacciones crean a la vez el contador de una serie nueva: se reintenta la transacción completa.
      if (error instanceof MongoServerError && error.code === 11000) throw new TransactionConflictError();
      throw error;
    }
  }
}

export function countersRepository(db: Db): CountersRepository {
  return new CountersRepository(db.collection<CounterDocument>(COUNTERS_COLLECTION));
}

export async function ensureCountersIndexes(db: Db): Promise<void> {
  await db.collection(COUNTERS_COLLECTION).createIndexes([
    { key: { tenantId: 1, series: 1 }, name: 'tenant_series_unique', unique: true },
  ]);
}
