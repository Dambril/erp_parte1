import { useState, type FormEvent } from 'react';
import { mensajeError } from '@erp/api-client';
import { NewPasswordFormSchema } from '@erp/domain';
import { Field, PasswordInput, Spinner } from '../components';
import { apiClient } from '../lib/api';

export type NuevaContrasenaModo = 'restablecer' | 'activar';

const TEXTOS: Record<NuevaContrasenaModo, { titulo: string; texto?: string; aviso: string }> = {
  restablecer: { titulo: 'Crear contraseña nueva', aviso: 'Tu contraseña se actualizó. Inicia sesión.' },
  activar: {
    titulo: 'Crea tu contraseña',
    texto: 'T-Ssera Construcciones te invitó a su espacio de trabajo',
    aviso: 'Tu cuenta está activa. Inicia sesión.',
  },
};

interface Props {
  modo: NuevaContrasenaModo;
  token: string | null;
  /** Vuelve al login mostrando `aviso`. */
  onTerminar: (aviso: string | null) => void;
}

/** `/restablecer?token=...` y `/activar?token=...`: misma pantalla, distinto título y endpoint. */
export function NuevaContrasenaPage({ modo, token, onTerminar }: Props) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errores, setErrores] = useState<{ password?: string; confirmPassword?: string }>({});
  const [error, setError] = useState<string | null>(token ? null : 'El enlace no es válido o ya venció. Solicita uno nuevo.');
  const [enviando, setEnviando] = useState(false);
  const textos = TEXTOS[modo];

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    // Mismo esquema que valida la API (packages/domain): 15 a 128 caracteres y que ambas coincidan.
    const parsed = NewPasswordFormSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const campos = parsed.error.flatten().fieldErrors;
      setErrores({ password: campos.password?.[0], confirmPassword: campos.confirmPassword?.[0] });
      return;
    }
    setErrores({});
    setError(null);
    setEnviando(true);
    try {
      const input = { token, password: parsed.data.password };
      await (modo === 'activar' ? apiClient.acceptInvitation(input) : apiClient.resetPassword(input));
      onTerminar(textos.aviso);
    } catch (err) {
      setError(mensajeError(err));
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
        <h1>{textos.titulo}</h1>
        {textos.texto ? <p className="muted">{textos.texto}</p> : null}
        <Field label="Nueva contraseña" hint="Mínimo 15 caracteres. Puedes usar una frase." error={errores.password}>
          <PasswordInput
            autoComplete="new-password"
            required
            disabled={enviando || !token}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirmar contraseña" error={errores.confirmPassword}>
          <PasswordInput
            autoComplete="new-password"
            required
            disabled={enviando || !token}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        {error ? <p className="alerta" role="alert">{error}</p> : null}
        <button className="btn btn-primary" disabled={enviando || !token}>
          {enviando ? <Spinner /> : null}
          Guardar contraseña
        </button>
        <button type="button" className="auth-link" onClick={() => onTerminar(null)} disabled={enviando}>
          Volver a iniciar sesión
        </button>
      </form>
    </div>
  );
}
