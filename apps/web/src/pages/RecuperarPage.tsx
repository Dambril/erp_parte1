import { useState, type FormEvent } from 'react';
import { mensajeError } from '@erp/api-client';
import { ForgotPasswordRequestSchema } from '@erp/domain';
import { Field, Spinner } from '../components';
import { apiClient } from '../lib/api';
import { navegar } from '../state';

/** "Recupera tu acceso" y, tras enviar, "Revisa tu correo". */
export function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reenvio, setReenvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const solicitar = async (destino: string) => {
    setEnviando(true);
    setError(null);
    setReenvio(null);
    try {
      // La API responde igual exista o no la cuenta.
      await apiClient.forgotPassword(destino);
      return true;
    } catch (err) {
      setError(mensajeError(err));
      return false;
    } finally {
      setEnviando(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = ForgotPasswordRequestSchema.safeParse({ email });
    setEmailError(parsed.success ? null : 'Ingresa un correo válido.');
    if (parsed.success && (await solicitar(parsed.data.email))) setEnviadoA(parsed.data.email);
  };

  const reenviar = async () => {
    if (enviadoA && (await solicitar(enviadoA))) setReenvio('Te enviamos otro enlace.');
  };

  const volver = <button type="button" className="auth-link" onClick={() => navegar('/')} disabled={enviando}>Volver a iniciar sesión</button>;

  return (
    <div className="login">
      <div className="login-hero">
        <img src="/logo.png" alt="T-Ssera Construcciones" />
      </div>
      {enviadoA ? (
        <div className="login-form">
          <div className="icono-sobre" aria-hidden="true">✉</div>
          <h1 className="center-text">Revisa tu correo</h1>
          <p className="muted center-text">
            Te enviamos un enlace para crear tu contraseña nueva. Si no lo ves, busca en la carpeta de spam.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => navegar('/')}>Volver a iniciar sesión</button>
          <button type="button" className="auth-link" onClick={reenviar} disabled={enviando}>
            {enviando ? 'Reenviando…' : 'Reenviar correo'}
          </button>
          {reenvio ? <p className="ok center-text small" role="status">{reenvio}</p> : null}
          {error ? <p className="alerta" role="alert">{error}</p> : null}
        </div>
      ) : (
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <h1>Recupera tu acceso</h1>
          <p className="muted">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
          <Field label="Correo" error={emailError}>
            <input
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.com"
              required
              disabled={enviando}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {error ? <p className="alerta" role="alert">{error}</p> : null}
          <button className="btn btn-primary" disabled={enviando}>
            {enviando ? <Spinner /> : null}
            Enviar enlace
          </button>
          {volver}
        </form>
      )}
    </div>
  );
}
