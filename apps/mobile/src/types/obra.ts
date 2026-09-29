import type {ObraEstado} from '../theme/colors';

export interface Obra {
  id: string;
  nombre: string;
  cliente: string;
  ubicacion: string;
  estado: ObraEstado;
  progreso: number; // 0-100
  certificacion?: string; // p. ej. "LEED Gold", "EDGE"
  alcance: string;
  impactoAmbiental: string;
  materiales: string[];
  presupuesto: string;
  cronograma: string;
}
