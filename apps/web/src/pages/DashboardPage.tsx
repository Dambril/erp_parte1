import { useMemo } from 'react';
import { CERTIFICACION_ESTADO_LABEL, calcularResumen, formatearMonto, formatearNumero } from '@erp/domain';
import { Card, ProgressBar, StatusBadge } from '../components';
import { navegar, useObras } from '../state';

export function DashboardPage() {
  const { obras, cargando, error } = useObras();
  const resumen = useMemo(() => calcularResumen(obras), [obras]);
  const enCurso = obras.filter((o) => o.etapa === 'ejecucion' || o.etapa === 'certificacion');

  return (
    <div className="page">
      <header className="page-header">
        <h1>Resumen de obras</h1>
        {cargando ? <span className="muted">Actualizando…</span> : null}
      </header>
      {error ? <p className="error">{error}</p> : null}

      <div className="kpis">
        <Kpi label="Obras activas" valor={String(resumen.activas)} />
        <Kpi label="Avance promedio" valor={`${resumen.avancePromedio}%`} tono="exito" />
        <Kpi label="Retrasadas" valor={String(resumen.retrasadas)} tono="alerta" />
        <Kpi label="Certificando" valor={String(resumen.certificando)} />
        <Kpi label="Propuestas por aprobar" valor={String(resumen.propuestas)} />
      </div>

      <div className="grid-2">
        <section className="card card-dark">
          <span className="label">CO₂ evitado acumulado (medido)</span>
          <strong className="big lima">{formatearNumero(resumen.impactoMedido.co2EvitadoKg / 1000, 1)} t</strong>
          <span>
            {formatearNumero(resumen.impactoMedido.energiaAhorradaKwh)} kWh ahorrados ·{' '}
            {formatearNumero(resumen.impactoMedido.aguaCaptadaM3)} m³ de agua captada
          </span>
        </section>
        <Card title="Presupuesto ejercido">
          {resumen.presupuesto.length === 0 ? <p className="muted">Sin obras con presupuesto activo.</p> : null}
          {resumen.presupuesto.map((p) => (
            <div key={p.moneda} className="stack">
              <strong className="big">{p.porcentajeEjercido}%</strong>
              <ProgressBar valor={p.porcentajeEjercido} />
              <span className="muted">{formatearMonto(p.ejercido, p.moneda)} de {formatearMonto(p.total, p.moneda)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Obras en curso">
          <table className="table">
            <thead><tr><th>Obra</th><th>Estado</th><th>Avance</th></tr></thead>
            <tbody>
              {enCurso.map((obra) => (
                <tr key={obra.id} className="clickable" onClick={() => navegar(`/obras/${obra.id}`)}>
                  <td><strong>{obra.nombre}</strong><div className="muted small">{obra.cliente}</div></td>
                  <td><StatusBadge estado={obra.estado} /></td>
                  <td className="w-30"><ProgressBar valor={obra.avance} /><span className="small muted">{obra.avance}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!cargando && enCurso.length === 0 ? <p className="muted">No hay obras en curso.</p> : null}
        </Card>
        <Card title="Certificaciones en curso">
          {resumen.certificacionesEnCurso.length === 0 ? <p className="muted">Sin certificaciones en curso.</p> : null}
          <ul className="list">
            {resumen.certificacionesEnCurso.map((c) => (
              <li key={c.obraId} className="clickable" onClick={() => navegar(`/obras/${c.obraId}`)}>
                <strong className="verde">{c.tipo} {c.nivelObjetivo}</strong> {c.obraNombre}
                <span className="muted small"> · {CERTIFICACION_ESTADO_LABEL[c.estado]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, valor, tono }: { label: string; valor: string; tono?: 'exito' | 'alerta' }) {
  return (
    <div className="card kpi">
      <strong className={tono ?? ''}>{valor}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}
