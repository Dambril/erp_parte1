import { useEffect, useState, type FormEvent } from 'react';
import { mensajeError } from '@erp/api-client';
import {
  CERTIFICACION_ESTADO_LABEL, MontoSchema, etiquetaAprobar, faseRetrasada, fechaLocalISO, formatearFecha,
  formatearMonto, formatearNumero, hoyISO, porcentajeMonto, type Obra,
} from '@erp/domain';
import { Card, Field, ProgressBar, StatusBadge } from '../components';
import { obrasStore } from '../lib/api';
import { navegar, useAuth, useObras } from '../state';

type Aviso = { texto: string; error: boolean } | null;

export function ObraDetailPage({ id }: { id: string }) {
  const { can } = useAuth();
  const { obras, cargando, store } = useObras();
  const obra = obras.find((o) => o.id === id);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [enviando, setEnviando] = useState(false);
  const [comentario, setComentario] = useState('');
  const [pidiendoCambios, setPidiendoCambios] = useState(false);

  if (!obra) {
    return <div className="page"><p className="muted">{cargando ? 'Cargando…' : 'La obra no existe o fue eliminada.'}</p></div>;
  }

  const etiqueta = etiquetaAprobar(obra.etapa);
  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setEnviando(true);
    setAviso(null);
    try {
      await accion();
      setAviso({ texto: exito, error: false });
      return true;
    } catch (error) {
      setAviso({ texto: mensajeError(error), error: true });
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar la obra "${obra.nombre}"? Dejará de verse en la web y en la app.`)) return;
    if (await ejecutar(() => store.eliminar(obra.id), 'Obra eliminada.')) navegar('/obras');
  };

  return (
    <div className="page">
      <a href="#/obras" className="back">← Obras</a>
      <header className="page-header">
        <div>
          <h1>{obra.nombre}</h1>
          <p className="muted">{obra.cliente} · {obra.ubicacion}</p>
        </div>
        <StatusBadge estado={obra.estado} />
      </header>

      {can('obras.approve') && (etiqueta || obra.etapa === 'propuesta' || obra.etapa === 'certificacion') ? (
        <div className="card actions">
          {etiqueta ? (
            <button
              className="btn btn-primary"
              disabled={enviando || (obra.etapa === 'ejecucion' && obra.avance < 100)}
              title={obra.etapa === 'ejecucion' && obra.avance < 100 ? 'Todas las fases deben estar al 100%' : undefined}
              onClick={() => ejecutar(() => store.aprobar(obra.id), 'Decisión registrada.')}
            >
              {etiqueta}
            </button>
          ) : null}
          {obra.etapa === 'propuesta' || obra.etapa === 'certificacion' ? (
            <button className="btn btn-secondary" onClick={() => setPidiendoCambios((v) => !v)}>Solicitar cambios</button>
          ) : null}
          {pidiendoCambios ? (
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await ejecutar(() => store.solicitarCambios(obra.id, comentario.trim()), 'Se solicitaron los cambios.')) {
                  setComentario('');
                  setPidiendoCambios(false);
                }
              }}
            >
              <textarea required placeholder="¿Qué hay que cambiar?" value={comentario} onChange={(e) => setComentario(e.target.value)} />
              <button className="btn btn-primary" disabled={enviando || !comentario.trim()}>Enviar</button>
            </form>
          ) : null}
        </div>
      ) : null}
      {aviso ? <p className={aviso.error ? 'error' : 'ok'}>{aviso.texto}</p> : null}

      <div className="grid-2">
        <Card title="Avance físico">
          <strong className="big">{obra.avance}%</strong>
          <ProgressBar valor={obra.avance} />
          {obra.alcance ? <p className="muted">{obra.alcance}</p> : null}
        </Card>
        <PresupuestoCard obra={obra} editable={can('obras.update')} ejecutar={ejecutar} />
      </div>

      <FasesCard obra={obra} editable={can('obras.update')} ejecutar={ejecutar} />

      <div className="grid-2">
        <ImpactoCard obra={obra} puedeMedir={can('obras.create') && obra.etapa !== 'propuesta'} ejecutar={ejecutar} />
        <Card title="Certificación">
          {obra.certificacion ? (
            <p><strong className="verde">{obra.certificacion.tipo} {obra.certificacion.nivelObjetivo}</strong> · {CERTIFICACION_ESTADO_LABEL[obra.certificacion.estado]}</p>
          ) : <p className="muted">Sin certificación objetivo.</p>}
        </Card>
      </div>

      <Card title="Materiales y proveeduría">
        {obra.materiales.length === 0 ? <p className="muted">Sin materiales registrados.</p> : (
          <table className="table">
            <thead><tr><th>Material</th><th>Proveedor</th><th>Origen</th><th>Distancia</th><th>Certificación</th></tr></thead>
            <tbody>
              {obra.materiales.map((m, i) => (
                <tr key={`${m.nombre}-${i}`}>
                  <td>{m.nombre}</td><td>{m.proveedor}</td><td>{m.origen}</td>
                  <td>{m.distanciaKm !== null ? `${formatearNumero(m.distanciaKm)} km` : '—'}</td>
                  <td>{m.certificacion ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Historial de decisiones">
        {obra.decisiones.length === 0 ? <p className="muted">Todavía no hay decisiones.</p> : (
          <ul className="list">
            {[...obra.decisiones].reverse().map((d, i) => (
              <li key={`${d.fecha}-${i}`}>
                <strong>{d.accion === 'aprobada' ? 'Aprobada' : 'Cambios solicitados'}</strong> por {d.autor.nombre}
                <span className="muted small"> · {formatearFecha(d.fecha)}</span>
                {d.comentario ? <div className="muted">{d.comentario}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {can('obras.delete') ? (
        <div className="danger-zone">
          <button className="btn btn-danger" onClick={eliminar} disabled={enviando}>Eliminar obra</button>
        </div>
      ) : null}
    </div>
  );
}

type Ejecutar = (accion: () => Promise<unknown>, exito: string) => Promise<boolean>;

function PresupuestoCard({ obra, editable, ejecutar }: { obra: Obra; editable: boolean; ejecutar: Ejecutar }) {
  const { moneda, total, ejercido } = obra.presupuesto;
  const [nuevo, setNuevo] = useState(ejercido);
  useEffect(() => setNuevo(ejercido), [ejercido]);
  const pct = porcentajeMonto(ejercido, total);
  const valido = MontoSchema.safeParse(nuevo).success;

  return (
    <Card title="Presupuesto">
      <strong className="big">{pct}%</strong>
      <ProgressBar valor={pct} />
      <p className="muted">{formatearMonto(ejercido, moneda)} ejercido de {formatearMonto(total, moneda)}</p>
      {pct > obra.avance + 10 ? <p className="error small">El gasto va {Math.round(pct - obra.avance)} puntos por encima del avance físico.</p> : null}
      {editable ? (
        <form className="inline-form" onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void ejecutar(() => obrasStore.actualizar(obra.id, { presupuesto: { moneda, total, ejercido: nuevo } }), 'Presupuesto actualizado.');
        }}>
          <Field label={`Ejercido (${moneda})`}>
            <input value={nuevo} inputMode="decimal" onChange={(e) => setNuevo(e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <button className="btn btn-secondary" disabled={!valido || nuevo === ejercido}>Guardar</button>
        </form>
      ) : null}
    </Card>
  );
}

function FasesCard({ obra, editable, ejecutar }: { obra: Obra; editable: boolean; ejecutar: Ejecutar }) {
  const [avances, setAvances] = useState<Record<string, number>>({});
  useEffect(() => setAvances(Object.fromEntries(obra.fases.map((f) => [f.id, f.avance]))), [obra.fases]);
  const cambiado = obra.fases.some((f) => avances[f.id] !== undefined && avances[f.id] !== f.avance);
  const hoy = hoyISO();

  return (
    <Card
      title="Cronograma de fases"
      actions={editable && cambiado ? (
        <button className="btn btn-primary" onClick={() => ejecutar(
          () => obrasStore.actualizar(obra.id, { fases: obra.fases.map((f) => ({ ...f, avance: avances[f.id] ?? f.avance })) }),
          'Avance actualizado.',
        )}>Guardar avance</button>
      ) : null}
    >
      {obra.fases.length === 0 ? <p className="muted">Sin fases definidas.</p> : (
        <table className="table">
          <thead><tr><th>Fase</th><th>Inicio</th><th>Fin</th><th>Avance</th></tr></thead>
          <tbody>
            {obra.fases.map((f) => (
              <tr key={f.id}>
                <td>
                  {f.nombre}
                  {obra.etapa === 'ejecucion' && faseRetrasada(f, hoy) ? <span className="tag-alerta">Retrasada</span> : null}
                </td>
                <td>{formatearFecha(f.inicio)}</td>
                <td>{formatearFecha(f.fin)}</td>
                <td className="w-30">
                  {editable && obra.etapa !== 'completada' ? (
                    <div className="range">
                      <input type="range" min={0} max={100} step={5} value={avances[f.id] ?? f.avance}
                        onChange={(e) => setAvances((prev) => ({ ...prev, [f.id]: Number(e.target.value) }))} />
                      <span>{avances[f.id] ?? f.avance}%</span>
                    </div>
                  ) : <><ProgressBar valor={f.avance} /><span className="small muted">{f.avance}%</span></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ImpactoCard({ obra, puedeMedir, ejecutar }: { obra: Obra; puedeMedir: boolean; ejecutar: Ejecutar }) {
  const { impactoEstimado: est, impactoMedido: med } = obra;
  const [form, setForm] = useState({ co2: '', energia: '', agua: '', fuente: '', fecha: fechaLocalISO() });
  const num = (texto: string) => Number(texto) || 0;
  const valido = form.fuente.trim() && num(form.co2) + num(form.energia) + num(form.agua) > 0;

  return (
    <Card title="Impacto ambiental">
      {est.descripcion ? <p className="muted">{est.descripcion}</p> : null}
      <table className="table">
        <thead><tr><th /><th>Medido</th><th>Estimado</th></tr></thead>
        <tbody>
          <tr><td>CO₂ evitado</td><td>{formatearNumero(med.co2EvitadoKg / 1000, 1)} t</td><td>{formatearNumero(est.co2EvitadoKg / 1000, 1)} t</td></tr>
          <tr><td>Energía ahorrada</td><td>{formatearNumero(med.energiaAhorradaKwh)} kWh</td><td>{formatearNumero(est.energiaAhorradaKwh)} kWh</td></tr>
          <tr><td>Agua captada</td><td>{formatearNumero(med.aguaCaptadaM3, 1)} m³</td><td>{formatearNumero(est.aguaCaptadaM3, 1)} m³</td></tr>
        </tbody>
      </table>
      <p className="muted small">{obra.mediciones.length} mediciones registradas</p>
      {puedeMedir ? (
        <form className="medicion-form" onSubmit={async (e) => {
          e.preventDefault();
          const ok = await ejecutar(() => obrasStore.registrarMedicion(obra.id, {
            fecha: form.fecha, co2EvitadoKg: num(form.co2), energiaAhorradaKwh: num(form.energia), aguaCaptadaM3: num(form.agua), fuente: form.fuente.trim(),
          }), 'Medición registrada.');
          if (ok) setForm({ co2: '', energia: '', agua: '', fuente: '', fecha: fechaLocalISO() });
        }}>
          <strong>Registrar medición</strong>
          <div className="form-grid">
            <Field label="Fecha"><input type="date" max={fechaLocalISO()} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></Field>
            <Field label="CO₂ evitado (kg)"><input type="number" min={0} step="any" value={form.co2} onChange={(e) => setForm({ ...form, co2: e.target.value })} /></Field>
            <Field label="Energía (kWh)"><input type="number" min={0} step="any" value={form.energia} onChange={(e) => setForm({ ...form, energia: e.target.value })} /></Field>
            <Field label="Agua (m³)"><input type="number" min={0} step="any" value={form.agua} onChange={(e) => setForm({ ...form, agua: e.target.value })} /></Field>
          </div>
          <Field label="Fuente"><input placeholder="Medidor, recibo, bitácora…" value={form.fuente} onChange={(e) => setForm({ ...form, fuente: e.target.value })} /></Field>
          <button className="btn btn-secondary" disabled={!valido}>Guardar medición</button>
        </form>
      ) : null}
    </Card>
  );
}
