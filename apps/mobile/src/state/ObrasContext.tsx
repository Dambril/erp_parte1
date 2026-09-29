import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {obrasIniciales} from '../data/obras';
import type {Obra} from '../types/obra';
import type {ObraEstado} from '../theme/colors';

const OBRAS_KEY = '@tssera/obras';

interface ObrasContextValue {
  obras: Obra[];
  getObra: (id: string) => Obra | undefined;
  aprobarObra: (id: string) => void;
  solicitarCambios: (id: string) => void;
}

const ObrasContext = createContext<ObrasContextValue | undefined>(undefined);

// "Aprobar" certifica la obra (pasa a completada); "Solicitar cambios" la
// regresa a en progreso para que el equipo la retome. Son las dos
// transiciones de estado que pide el brief para el detalle de propuesta.
const SIGUIENTE_ESTADO: Partial<Record<ObraEstado, ObraEstado>> = {
  certificando: 'completada',
};

export function ObrasProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const [obras, setObras] = useState<Obra[]>(obrasIniciales);

  useEffect(() => {
    AsyncStorage.getItem(OBRAS_KEY)
      .then((raw) => {
        if (raw) setObras(JSON.parse(raw));
      })
      .catch(() => {
        // Si no se puede leer, se sigue con los datos de ejemplo.
      });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(OBRAS_KEY, JSON.stringify(obras)).catch(() => {
      // Persistencia best-effort: si falla, el cambio sigue vivo en memoria.
    });
  }, [obras]);

  const actualizarEstado = (id: string, estado: ObraEstado, progreso?: number) => {
    setObras((prev) =>
      prev.map((obra) =>
        obra.id === id ? {...obra, estado, progreso: progreso ?? obra.progreso} : obra,
      ),
    );
  };

  const value = useMemo<ObrasContextValue>(
    () => ({
      obras,
      getObra: (id) => obras.find((obra) => obra.id === id),
      aprobarObra: (id) => {
        const obra = obras.find((o) => o.id === id);
        const siguiente = obra ? SIGUIENTE_ESTADO[obra.estado] ?? 'certificando' : 'certificando';
        actualizarEstado(id, siguiente, siguiente === 'completada' ? 100 : undefined);
      },
      solicitarCambios: (id) => actualizarEstado(id, 'en_progreso'),
    }),
    [obras],
  );

  return <ObrasContext.Provider value={value}>{children}</ObrasContext.Provider>;
}

export function useObras(): ObrasContextValue {
  const ctx = useContext(ObrasContext);
  if (!ctx) throw new Error('useObras debe usarse dentro de <ObrasProvider>');
  return ctx;
}
