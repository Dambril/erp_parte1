export interface DemoUser {
  nombre: string;
  email: string;
}

// Login "hardcodeado" para la demo, tal como describe el brief. Cuando se
// conecte un backend real, esta función se reemplaza por una llamada a
// apps/api sin tocar AuthContext ni las pantallas.
const DEMO_EMAIL = 'roberto@tssera.com';
const DEMO_PASSWORD = 'demo1234';
const DEMO_USER: DemoUser = {nombre: 'Roberto', email: DEMO_EMAIL};

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function loginConCredenciales(email: string, password: string): Promise<DemoUser> {
  // Simula latencia de red para que el estado de carga del botón se note.
  await new Promise((resolve) => setTimeout(resolve, 600));

  if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    throw new Error('Correo o contraseña incorrectos.');
  }
  return DEMO_USER;
}
