import { ROLE_LABEL, roleCan } from '@erp/domain';
import { Conexion } from './components';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NuevaObraPage } from './pages/NuevaObraPage';
import { ObraDetailPage } from './pages/ObraDetailPage';
import { ObrasPage } from './pages/ObrasPage';
import { useAuth, useObras, useRuta } from './state';

export function App() {
  const { user, cargandoSesion, logout } = useAuth();
  const { conexion } = useObras();
  const ruta = useRuta();

  if (cargandoSesion) return <div className="center-screen">Cargando…</div>;
  if (!user) return <LoginPage />;

  const detalle = ruta.match(/^\/obras\/([^/]+)$/);
  let pagina;
  if (ruta === '/obras/nueva' && roleCan(user.role, 'create')) pagina = <NuevaObraPage />;
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
          {roleCan(user.role, 'create') ? <a href="#/obras/nueva" className={activo('/obras/nueva')}>Nueva obra</a> : null}
        </nav>
        <div className="sidebar-footer">
          <Conexion estado={conexion} />
          <div className="user">
            <strong>{user.name}</strong>
            <span>{ROLE_LABEL[user.role]}</span>
          </div>
          <button className="btn btn-secondary" onClick={() => logout()}>Cerrar sesión</button>
        </div>
      </aside>
      <main className="main">{pagina}</main>
    </div>
  );
}
