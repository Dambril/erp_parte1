import {useCallback, useState} from 'react';
import {mensajeError} from '@erp/api-client';
import {useConstruction} from '../state/ConstructionContext';

/**
 * Ejecuta una acción contra la API con su estado de envío y su error en español. Si termina bien,
 * avisa a las demás pantallas para que se pongan al día.
 */
export function useSubmit(): {
  busy: boolean;
  error: string | null;
  clearError: () => void;
  submit: <T>(action: () => Promise<T>, onDone: (result: T) => void) => Promise<void>;
} {
  const {refresh} = useConstruction();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async <T,>(action: () => Promise<T>, onDone: (result: T) => void) => {
      setBusy(true);
      setError(null);
      try {
        const result = await action();
        refresh();
        onDone(result);
      } catch (err) {
        setError(mensajeError(err));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return {busy, error, clearError: useCallback(() => setError(null), []), submit};
}
