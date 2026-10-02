import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import type { RealtimeStatus } from '@erp/api-client';
import { OBRA_ESTADO_LABEL, type ObraEstado } from '@erp/domain';

export function StatusBadge({ estado }: { estado: ObraEstado }) {
  return <span className={`badge badge-${estado}`}>{OBRA_ESTADO_LABEL[estado]}</span>;
}

export function ProgressBar({ valor }: { valor: number }) {
  const pct = Math.max(0, Math.min(100, valor));
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={pct >= 100 ? 'progress-fill done' : 'progress-fill'} style={{ width: `${pct}%` }} />
    </div>
  );
}

const CONEXION: Record<RealtimeStatus, string> = {
  conectado: 'En vivo',
  conectando: 'Conectando…',
  desconectado: 'Sin conexión',
};

export function Conexion({ estado }: { estado: RealtimeStatus }) {
  return (
    <span className="conexion" title="Sincronización en tiempo real con la app móvil">
      <span className={`dot dot-${estado}`} />
      {CONEXION[estado]}
    </span>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {title || actions ? (
        <header className="card-header">
          {title ? <h3>{title}</h3> : <span />}
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

/** Contraseña con botón para mostrarla u ocultarla. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </span>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
