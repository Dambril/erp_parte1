import { useState, type FormEvent } from 'react';
import { ForgotPasswordRequestSchema } from '@erp/domain';
import { Field, PasswordInput, Spinner } from '../components';
import { navegar, useAuth } from '../state';

export function LoginPage() {
  const { login, aviso } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  // Credenciales incorrectas, bloqueo por intentos o sin conexión: el mensaje viene de mensajeError.
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const emailValido = ForgotPasswordRequestSchema.safeParse({ email }).success;
    setEmailError(emailValido ? null : 'Ingresa un correo válido.');
    setError(null);
    if (!emailValido) return;

    setEnviando(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="login">
      <div className="login-hero">
        <img src="/logo.png" alt="T-Ssera Construcciones" />
      </div>
      <form className="login-form" onSubmit={onSubmit} noValidate>
        <h1>Bienvenido de vuelta</h1>
        {aviso ? <p className="aviso" role="status">{aviso}</p> : null}
        <Field label="Correo" error={emailError}>
          <input
            type="email"
            autoComplete="username"
            placeholder="tu@empresa.com"
            required
            disabled={enviando}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Contraseña">
          <PasswordInput
            autoComplete="current-password"
            required
            disabled={enviando}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="button" className="auth-link end" onClick={() => navegar('/recuperar')} disabled={enviando}>
          ¿Olvidaste tu contraseña?
        </button>
        {error ? <p className="alerta" role="alert">{error}</p> : null}
        <button className="btn btn-primary" disabled={enviando || !password}>
          {enviando ? <Spinner /> : null}
          Iniciar sesión
        </button>
      </form>
    </div>
  );
}
