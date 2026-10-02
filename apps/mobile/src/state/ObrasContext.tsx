import React, {useEffect, useSyncExternalStore} from 'react';
import type {ObrasState} from '@erp/api-client';
import {obrasStore} from '../lib/apiClient';
import {useAuth} from './AuthContext';

/** Carga las obras y abre el canal de tiempo real mientras haya sesión. */
export function ObrasProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const {status} = useAuth();

  useEffect(() => {
    if (status !== 'signedIn') return;
    obrasStore.start();
    return () => obrasStore.stop();
  }, [status]);

  return <>{children}</>;
}

export function useObras(): ObrasState & {store: typeof obrasStore} {
  const state = useSyncExternalStore(obrasStore.subscribe, obrasStore.getSnapshot);
  return {...state, store: obrasStore};
}
