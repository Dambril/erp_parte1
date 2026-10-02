import { useState } from 'react';
import { ROLE_LABEL } from '@erp/domain';
import { LoginPage } from './pages/LoginPage';
import { NuevaContrasenaPage, type NuevaContrasenaModo } from './pages/NuevaContrasenaPage';
import { RecuperarPage } from './pages/RecuperarPage';
import { useAuth, useRuta } from './state';

const RUTAS_PUBLICAS: Record<string, NuevaContrasenaModo> = { '/restablecer': 'restablecer', '/activar': 'activar' };

/**
 * Enlaces de los correos: `/restablecer?token=...` y `/activar?token=...` son rutas reales (no hash) porque
 * así las genera la API. Cloudflare Pages y Vite sirven index.html para cualquier ruta.
 */
function enlaceDeCorreo(): { modo: NuevaContrasenaModo; token: string | null } | null {
  const modo = RUTAS_PUBLICAS[window.location.pathname.replace(/\/+$/, '')];
  return modo ? { modo, token: new URLSearchParams(window.location.search).get('token') } : null;
}

export function App() {
  const { status, user, company, logout, retry, setAviso } = useAuth();
  const ruta = useRuta();
  const [enlace, setEnlace] = useState(enlaceDeCorreo);

  if (enlace) {
    const terminar = (aviso: string | null) => {
      // Quita el token de la barra de direcciones y vuelve a la app.
      window.history.replaceState(null, '', '/#/');
      setEnlace(null);
      setAviso(aviso);
      // Tras cambiar la contraseña la API revocó las sesiones: se vuelve al login aunque esta pestaña tuviera una.
      if (aviso && status === 'signedIn') void logout();
    };
    return <NuevaContrasenaPage modo={enlace.modo} token={enlace.token} onTerminar={terminar} />;
  }

  if (status === 'loading') return <div className="center-screen">Cargando…</div>;
  if (status === 'offline') {
    return (
      <div className="center-screen">
        <div className="login-form">
          <h1>Sin conexión</h1>
          <p className="muted">Revisa tu internet e inténtalo de nuevo.</p>
          <button className="btn btn-primary" onClick={retry}>Reintentar</button>
        </div>
      </div>
    );
  }
  if (status === 'signedOut' || !user) {
    // Cualquier otra ruta muestra el login y, al entrar, la página pedida.
    return ruta === '/recuperar' ? <RecuperarPage /> : <LoginPage />;
  }

  // El módulo de construcción (obras, propuestas, presupuesto) vive por ahora solo en la app móvil.
  return (
    <div className="center-screen">
      <div className="login-form">
        <h1>Hola, {user.name}</h1>
        <p className="muted">{ROLE_LABEL[user.role]}{company ? ` · ${company.name}` : ''}</p>
        <p>
          Las obras, las propuestas y el presupuesto están disponibles en la app móvil de T-Ssera.
          La versión web de estas pantallas está en migración.
        </p>
        <button className="btn btn-secondary" onClick={() => logout()}>Cerrar sesión</button>
      </div>
    </div>
  );
}
