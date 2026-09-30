import { useState, type FormEvent } from 'react';
import { mensajeError } from '@erp/api-client';
import { CertificacionTipoSchema, CreateObraRequestSchema, fechaLocalISO, type CreateObraInput } from '@erp/domain';
import { Card, Field } from '../components';
import { navegar, useObras } from '../state';

interface FaseForm { nombre: string; inicio: string; fin: string }
interface MaterialForm { nombre: string; proveedor: string; origen: string; distanciaKm: string }

const faseVacia = (): FaseForm => ({ nombre: '', inicio: fechaLocalISO(), fin: fechaLocalISO() });
const materialVacio = (): MaterialForm => ({ nombre: '', proveedor: '', origen: '', distanciaKm: '' });

export function NuevaObraPage() {
  const { store } = useObras();
  const [general, setGeneral] = useState({ nombre: '', cliente: '', ubicacion: '', alcance: '' });
  const [presupuesto, setPresupuesto] = useState({ moneda: 'MXN', total: '' });
  const [cert, setCert] = useState({ tipo: '' as '' | 'LEED' | 'EDGE', nivelObjetivo: '' });
  const [impacto, setImpacto] = useState({ co2: '', energia: '', agua: '', descripcion: '' });
  const [fases, setFases] = useState<FaseForm[]>([faseVacia()]);
  const [materiales, setMateriales] = useState<MaterialForm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const input: CreateObraInput = {
      ...general,
      presupuesto: { moneda: presupuesto.moneda, total: presupuesto.total, ejercido: '0' },
      certificacion: cert.tipo ? { tipo: cert.tipo, nivelObjetivo: cert.nivelObjetivo } : null,
      impactoEstimado: {
        co2EvitadoKg: Number(impacto.co2) || 0,
        energiaAhorradaKwh: Number(impacto.energia) || 0,
        aguaCaptadaM3: Number(impacto.agua) || 0,
        descripcion: impacto.descripcion,
      },
      fases: fases.filter((f) => f.nombre.trim()).map((f) => ({ ...f, avance: 0 })),
      materiales: materiales.filter((m) => m.nombre.trim()).map((m) => ({
        ...m, distanciaKm: m.distanciaKm ? Number(m.distanciaKm) : null,
      })),
    };
    // Se valida con el mismo esquema que la API para mostrar el error antes de enviar.
    const parsed = CreateObraRequestSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`Revisa "${issue.path.join(' › ')}": ${issue.message}`);
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const obra = await store.crear(input);
      navegar(`/obras/${obra.id}`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const actualizarLista = <T,>(lista: T[], setLista: (v: T[]) => void, index: number, cambios: Partial<T>) =>
    setLista(lista.map((item, i) => (i === index ? { ...item, ...cambios } : item)));

  return (
    <form className="page" onSubmit={onSubmit}>
      <header className="page-header">
        <h1>Nueva obra</h1>
        <button className="btn btn-primary" disabled={enviando}>{enviando ? 'Guardando…' : 'Crear propuesta'}</button>
      </header>
      <p className="muted">La obra se crea como propuesta; un gerente la aprueba para iniciar la ejecución.</p>
      {error ? <p className="error">{error}</p> : null}

      <Card title="Datos generales">
        <div className="form-grid">
          <Field label="Nombre"><input required value={general.nombre} onChange={(e) => setGeneral({ ...general, nombre: e.target.value })} /></Field>
          <Field label="Cliente"><input required value={general.cliente} onChange={(e) => setGeneral({ ...general, cliente: e.target.value })} /></Field>
          <Field label="Ubicación"><input required value={general.ubicacion} onChange={(e) => setGeneral({ ...general, ubicacion: e.target.value })} /></Field>
        </div>
        <Field label="Alcance"><textarea value={general.alcance} onChange={(e) => setGeneral({ ...general, alcance: e.target.value })} /></Field>
      </Card>

      <div className="grid-2">
        <Card title="Presupuesto">
          <div className="form-grid">
            <Field label="Total"><input required inputMode="decimal" placeholder="42500000.00" value={presupuesto.total}
              onChange={(e) => setPresupuesto({ ...presupuesto, total: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="Moneda"><input maxLength={3} value={presupuesto.moneda} onChange={(e) => setPresupuesto({ ...presupuesto, moneda: e.target.value.toUpperCase() })} /></Field>
          </div>
        </Card>
        <Card title="Certificación objetivo">
          <div className="form-grid">
            <Field label="Tipo">
              <select value={cert.tipo} onChange={(e) => setCert({ ...cert, tipo: e.target.value as typeof cert.tipo })}>
                <option value="">Sin certificación</option>
                {CertificacionTipoSchema.options.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </Field>
            <Field label="Nivel objetivo">
              <input disabled={!cert.tipo} placeholder="Gold, Silver, EDGE Advanced…" value={cert.nivelObjetivo} onChange={(e) => setCert({ ...cert, nivelObjetivo: e.target.value })} />
            </Field>
          </div>
        </Card>
      </div>

      <Card title="Impacto ambiental estimado">
        <div className="form-grid">
          <Field label="CO₂ evitado (kg)"><input type="number" min={0} step="any" value={impacto.co2} onChange={(e) => setImpacto({ ...impacto, co2: e.target.value })} /></Field>
          <Field label="Energía ahorrada (kWh)"><input type="number" min={0} step="any" value={impacto.energia} onChange={(e) => setImpacto({ ...impacto, energia: e.target.value })} /></Field>
          <Field label="Agua captada (m³)"><input type="number" min={0} step="any" value={impacto.agua} onChange={(e) => setImpacto({ ...impacto, agua: e.target.value })} /></Field>
        </div>
        <Field label="Estrategias"><textarea value={impacto.descripcion} onChange={(e) => setImpacto({ ...impacto, descripcion: e.target.value })} /></Field>
      </Card>

      <Card title="Cronograma de fases" actions={<button type="button" className="btn btn-secondary" onClick={() => setFases([...fases, faseVacia()])}>Agregar fase</button>}>
        {fases.map((fase, i) => (
          <div key={i} className="form-row">
            <Field label="Fase"><input value={fase.nombre} onChange={(e) => actualizarLista(fases, setFases, i, { nombre: e.target.value })} /></Field>
            <Field label="Inicio"><input type="date" value={fase.inicio} onChange={(e) => actualizarLista(fases, setFases, i, { inicio: e.target.value })} /></Field>
            <Field label="Fin"><input type="date" value={fase.fin} onChange={(e) => actualizarLista(fases, setFases, i, { fin: e.target.value })} /></Field>
            <button type="button" className="btn btn-link" onClick={() => setFases(fases.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
      </Card>

      <Card title="Materiales y proveeduría" actions={<button type="button" className="btn btn-secondary" onClick={() => setMateriales([...materiales, materialVacio()])}>Agregar material</button>}>
        {materiales.length === 0 ? <p className="muted">Sin materiales.</p> : null}
        {materiales.map((m, i) => (
          <div key={i} className="form-row">
            <Field label="Material"><input value={m.nombre} onChange={(e) => actualizarLista(materiales, setMateriales, i, { nombre: e.target.value })} /></Field>
            <Field label="Proveedor"><input value={m.proveedor} onChange={(e) => actualizarLista(materiales, setMateriales, i, { proveedor: e.target.value })} /></Field>
            <Field label="Origen"><input value={m.origen} onChange={(e) => actualizarLista(materiales, setMateriales, i, { origen: e.target.value })} /></Field>
            <Field label="Km"><input type="number" min={0} value={m.distanciaKm} onChange={(e) => actualizarLista(materiales, setMateriales, i, { distanciaKm: e.target.value })} /></Field>
            <button type="button" className="btn btn-link" onClick={() => setMateriales(materiales.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
      </Card>
    </form>
  );
}
