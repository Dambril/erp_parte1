import { useState, type FormEvent } from 'react';
import { Field } from '../components';
import { useAuth } from '../state';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setEnviando(true);
    setError(null);
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
        <p>Construcción con sustentabilidad medible: avance, presupuesto y certificaciones de todas tus obras en un solo panel.</p>
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <h1>Inicia sesión</h1>
        <p className="muted">Accede al panel de obras y certificaciones.</p>
        <Field label="Correo">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <p className="muted small">¿Sin acceso? Pide a un administrador que te cree una cuenta.</p>
      </form>
    </div>
  );
}
