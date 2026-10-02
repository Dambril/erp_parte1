import type { CreateObraInput, MedicionInput, Obra, RealtimeEvent, UpdateObraInput } from '@erp/domain';
import { mensajeError } from './errors';
import type { ApiClient } from './index';
import { connectRealtime, type RealtimeConnection, type RealtimeStatus } from './realtime';

export interface ObrasState {
  obras: Obra[];
  cargando: boolean;
  error: string | null;
  conexion: RealtimeStatus;
}

const INICIAL: ObrasState = { obras: [], cargando: false, error: null, conexion: 'desconectado' };

/**
 * Estado de obras compartido por la app y la web, independiente de React: se consume con
 * `useSyncExternalStore(store.subscribe, store.getSnapshot)`. Se mantiene al día con los
 * eventos del canal de tiempo real, así un cambio hecho en la web aparece en la app y viceversa.
 */
export class ObrasStore {
  private state: ObrasState = INICIAL;
  private readonly listeners = new Set<() => void>();
  private realtime: RealtimeConnection | null = null;
  private yaConectado = false;

  constructor(private readonly client: ApiClient) {}

  getSnapshot = (): ObrasState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getObra(id: string): Obra | undefined {
    return this.state.obras.find((obra) => obra.id === id);
  }

  start(): void {
    if (this.realtime) return;
    this.yaConectado = false;
    void this.refrescar();
    this.realtime = connectRealtime(this.client, {
      onEvent: (event) => this.aplicar(event),
      onStatus: (conexion) => this.set({ conexion }),
      onReady: () => {
        // La primera conexión coincide con la carga inicial; las siguientes recuperan lo perdido.
        if (this.yaConectado) void this.refrescar();
        this.yaConectado = true;
      },
    });
  }

  stop(): void {
    this.realtime?.close();
    this.realtime = null;
    this.state = INICIAL;
    this.emit();
  }

  async refrescar(): Promise<void> {
    this.set({ cargando: true, error: null });
    try {
      this.set({ obras: await this.client.obras.list(), cargando: false });
    } catch (error) {
      this.set({ cargando: false, error: mensajeError(error) });
    }
  }

  aplicar(event: RealtimeEvent): void {
    if (event.type === 'construction.changed') return;
    if (event.type === 'obra.delete') {
      this.set({ obras: this.state.obras.filter((obra) => obra.id !== event.id) });
      return;
    }
    const actual = this.getObra(event.obra.id);
    // La respuesta HTTP y el evento del canal pueden llegar en cualquier orden: gana la versión más reciente.
    if (actual && actual.updatedAt > event.obra.updatedAt) return;
    const resto = this.state.obras.filter((obra) => obra.id !== event.obra.id);
    this.set({ obras: [event.obra, ...resto].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
  }

  crear = (input: CreateObraInput) => this.guardar(this.client.obras.create(input));
  actualizar = (id: string, input: UpdateObraInput) => this.guardar(this.client.obras.update(id, input));
  aprobar = (id: string, comentario?: string) => this.guardar(this.client.obras.aprobar(id, comentario));
  solicitarCambios = (id: string, comentario: string) => this.guardar(this.client.obras.solicitarCambios(id, comentario));
  registrarMedicion = (id: string, input: MedicionInput) => this.guardar(this.client.obras.registrarMedicion(id, input));

  eliminar = async (id: string): Promise<void> => {
    await this.client.obras.remove(id);
    this.aplicar({ type: 'obra.delete', id });
  };

  private async guardar(promesa: Promise<Obra>): Promise<Obra> {
    const obra = await promesa;
    this.aplicar({ type: 'obra.upsert', obra });
    return obra;
  }

  private set(partial: Partial<ObrasState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
