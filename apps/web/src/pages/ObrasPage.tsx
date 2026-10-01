import { useMemo, useState } from 'react';
import { OBRA_ESTADO_LABEL, ObraEstadoSchema, porcentajeMonto, type ObraEstado } from '@erp/domain';
import { ProgressBar, StatusBadge } from '../components';
import { navegar, useObras } from '../state';

export function ObrasPage() {
  const { obras, cargando, error, store } = useObras();
  const [query, setQuery] = useState('');
  const [filtro, setFiltro] = useState<'todas' | ObraEstado>('todas');

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return obras.filter((obra) =>
      (!q || [obra.nombre, obra.cliente, obra.ubicacion].some((texto) => texto.toLowerCase().includes(q)))
      && (filtro === 'todas' || obra.estado === filtro));
  }, [obras, query, filtro]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Obras</h1>
        <button className="btn btn-secondary" onClick={() => store.refrescar()} disabled={cargando}>
          {cargando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>
      <div className="toolbar">
        <input className="search" placeholder="Buscar por nombre, cliente o ciudad" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {(['todas', ...ObraEstadoSchema.options] as const).map((key) => (
            <button key={key} className={filtro === key ? 'chip active' : 'chip'} onClick={() => setFiltro(key)}>
              {key === 'todas' ? 'Todas' : OBRA_ESTADO_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr><th>Obra</th><th>Ubicación</th><th>Estado</th><th>Avance</th><th>Presupuesto ejercido</th><th>Certificación</th></tr>
          </thead>
          <tbody>
            {filtradas.map((obra) => (
              <tr key={obra.id} className="clickable" onClick={() => navegar(`/obras/${obra.id}`)}>
                <td><strong>{obra.nombre}</strong><div className="muted small">{obra.cliente}</div></td>
                <td>{obra.ubicacion}</td>
                <td><StatusBadge estado={obra.estado} /></td>
                <td className="w-20"><ProgressBar valor={obra.avance} /><span className="small muted">{obra.avance}%</span></td>
                <td>{porcentajeMonto(obra.presupuesto.ejercido, obra.presupuesto.total)}%</td>
                <td>{obra.certificacion ? `${obra.certificacion.tipo} ${obra.certificacion.nivelObjetivo}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && filtradas.length === 0 ? (
          <p className="muted empty">{obras.length === 0 ? 'Todavía no hay obras registradas.' : 'No hay obras con ese filtro.'}</p>
        ) : null}
      </div>
    </div>
  );
}
