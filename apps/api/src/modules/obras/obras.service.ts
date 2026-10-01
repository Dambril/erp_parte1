import { randomUUID } from 'node:crypto';
import {
  calcularResumen, transicionAprobar, transicionSolicitarCambios,
  type Autor, type CreateObraRequest, type FaseInput, type MedicionRequest, type Obra, type ObrasQuery,
  type ResumenObras, type TransicionResultado, type UpdateObraRequest,
} from '@erp/domain';
import { HttpError } from '../../core/http-error';
import type { AuditLog } from '../../core/audit';
import type { RealtimePublisher } from '../../core/realtime';
import type { RequestUser } from '../../core/middlewares/auth';
import type { UsersRepository } from '../identity/identity.repository';
import { toDecimal, toObra, type ObraDocument, type ObrasRepository } from './obras.repository';

const notFound = () => new HttpError(404, 'OBRA_NOT_FOUND', 'Obra no encontrada');

function conIds(fases: FaseInput[]) {
  return fases.map((fase) => ({ ...fase, id: fase.id ?? randomUUID() }));
}

export class ObrasService {
  public constructor(
    private readonly obras: ObrasRepository,
    private readonly users: UsersRepository,
    private readonly audit: AuditLog,
    private readonly publish: RealtimePublisher,
  ) {}

  async list(tenantId: string, query: ObrasQuery): Promise<Obra[]> {
    const obras = (await this.obras.search(tenantId, query.q)).map((doc) => toObra(doc));
    return query.estado ? obras.filter((obra) => obra.estado === query.estado) : obras;
  }

  async resumen(tenantId: string): Promise<ResumenObras> {
    return calcularResumen(await this.list(tenantId, {}));
  }

  async get(id: string, tenantId: string): Promise<Obra> {
    const document = await this.obras.findById(id, tenantId);
    if (!document) throw notFound();
    return toObra(document);
  }

  async create(input: CreateObraRequest, actor: RequestUser): Promise<Obra> {
    const document = await this.obras.insert({
      nombre: input.nombre,
      cliente: input.cliente,
      ubicacion: input.ubicacion,
      alcance: input.alcance,
      etapa: 'propuesta',
      presupuesto: {
        moneda: input.presupuesto.moneda,
        total: toDecimal(input.presupuesto.total),
        ejercido: toDecimal(input.presupuesto.ejercido),
      },
      certificacion: input.certificacion,
      impactoEstimado: input.impactoEstimado,
      materiales: input.materiales,
      fases: conIds(input.fases),
      mediciones: [],
      decisiones: [],
    }, actor.tenantId);
    return this.afterChange(document, actor, 'obra.create', { nombre: input.nombre });
  }

  async update(id: string, input: UpdateObraRequest, actor: RequestUser): Promise<Obra> {
    const { presupuesto, fases, ...rest } = input;
    const changes: Partial<ObraDocument> = { ...rest };
    if (presupuesto) {
      changes.presupuesto = { moneda: presupuesto.moneda, total: toDecimal(presupuesto.total), ejercido: toDecimal(presupuesto.ejercido) };
    }
    if (fases) changes.fases = conIds(fases);

    const document = await this.obras.updateById(id, actor.tenantId, changes);
    if (!document) throw notFound();
    return this.afterChange(document, actor, 'obra.update', { campos: Object.keys(input) });
  }

  async aprobar(id: string, comentario: string | undefined, actor: RequestUser): Promise<Obra> {
    const obra = await this.get(id, actor.tenantId);
    const resultado = transicionAprobar(obra);
    const set: Partial<ObraDocument> = {};
    if (resultado.ok && obra.etapa === 'certificacion' && obra.certificacion) {
      set.certificacion = { ...obra.certificacion, estado: 'obtenida' };
    }
    return this.transition(obra, resultado, 'aprobada', comentario ?? null, set, actor);
  }

  async solicitarCambios(id: string, comentario: string, actor: RequestUser): Promise<Obra> {
    const obra = await this.get(id, actor.tenantId);
    return this.transition(obra, transicionSolicitarCambios(obra), 'cambios_solicitados', comentario, {}, actor);
  }

  async registrarMedicion(id: string, input: MedicionRequest, actor: RequestUser): Promise<Obra> {
    const document = await this.obras.addMedicion(id, actor.tenantId, {
      ...input,
      id: randomUUID(),
      registradoPor: await this.autor(actor),
      registradoEn: new Date(),
    });
    if (!document) throw notFound();
    return this.afterChange(document, actor, 'obra.medicion', { ...input });
  }

  async remove(id: string, actor: RequestUser): Promise<void> {
    if (!(await this.obras.softDeleteById(id, actor.tenantId))) throw notFound();
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.id, action: 'obra.delete', entity: 'obra', entityId: id });
    this.publish(actor.tenantId, { type: 'obra.delete', id });
  }

  private async transition(
    obra: Obra,
    resultado: TransicionResultado,
    accion: 'aprobada' | 'cambios_solicitados',
    comentario: string | null,
    set: Partial<ObraDocument>,
    actor: RequestUser,
  ): Promise<Obra> {
    if (!resultado.ok) throw new HttpError(409, resultado.code, resultado.message);
    const document = await this.obras.transition(obra.id, actor.tenantId, obra.etapa, { ...set, etapa: resultado.aEtapa }, {
      accion, deEtapa: obra.etapa, aEtapa: resultado.aEtapa, comentario, autor: await this.autor(actor), fecha: new Date(),
    });
    if (!document) throw new HttpError(409, 'OBRA_MODIFICADA', 'La obra cambió mientras se procesaba la acción; recarga e intenta de nuevo');
    return this.afterChange(document, actor, `obra.${accion}`, { de: obra.etapa, a: resultado.aEtapa, comentario });
  }

  private async afterChange(document: ObraDocument, actor: RequestUser, action: string, details: Record<string, unknown>): Promise<Obra> {
    const obra = toObra(document);
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.id, action, entity: 'obra', entityId: obra.id, details });
    this.publish(actor.tenantId, { type: 'obra.upsert', obra });
    return obra;
  }

  private async autor(actor: RequestUser): Promise<Autor> {
    const user = await this.users.findById(actor.id, actor.tenantId);
    return { id: actor.id, nombre: user?.name ?? 'Usuario eliminado' };
  }
}
