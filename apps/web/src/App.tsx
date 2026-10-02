import { useState } from 'react';
import { ROLE_LABEL } from '@erp/domain';
import { Conexion } from './components';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NuevaContrasenaPage, type NuevaContrasenaModo } from './pages/NuevaContrasenaPage';
import { NuevaObraPage } from './pages/NuevaObraPage';
import { ObraDetailPage } from './pages/ObraDetailPage';
import { ObrasPage } from './pages/ObrasPage';
import { RecuperarPage } from './pages/RecuperarPage';
import { useAuth, useObras, useRuta } from './state';

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
  const { status, user, company, can, logout, retry, setAviso } = useAuth();
  const { conexion } = useObras();
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

  const detalle = ruta.match(/^\/obras\/([^/]+)$/);
  let pagina;
  if (ruta === '/obras/nueva' && can('obras.create')) pagina = <NuevaObraPage />;
  else if (detalle) pagina = <ObraDetailPage id={decodeURIComponent(detalle[1])} />;
  else if (ruta === '/obras') pagina = <ObrasPage />;
  else pagina = <DashboardPage />;

  const activo = (prefijo: string) => (prefijo === '/' ? ruta === '/' : ruta.startsWith(prefijo)) ? 'active' : '';

  return (
    <div className="layout">
      <aside className="sidebar">
        <img src="/logo.png" alt="T-Ssera Construcciones" className="sidebar-logo" />
        <nav>
          <a href="#/" className={activo('/')}>Dashboard</a>
          <a href="#/obras" className={ruta === '/obras' || (detalle && ruta !== '/obras/nueva') ? 'active' : ''}>Obras</a>
          {can('obras.create') ? <a href="#/obras/nueva" className={activo('/obras/nueva')}>Nueva obra</a> : null}
        </nav>
        <div className="sidebar-footer">
          <Conexion estado={conexion} />
          <div className="user">
            <strong>{user.name}</strong>
            <span>{ROLE_LABEL[user.role]}{company ? ` · ${company.name}` : ''}</span>
          </div>
          <button className="btn btn-secondary" onClick={() => logout()}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main">{pagina}</main>
    </div>
  );
}
