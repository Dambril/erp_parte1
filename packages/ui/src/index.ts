import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { ApiClient } from '@erp/api-client';

export interface HealthViewModel { status: string; database: string }

export function formatHealthStatus(health: HealthViewModel): string {
  return `${health.status} (database: ${health.database})`;
}

export function HealthApp({ client }: { client?: ApiClient }): React.ReactElement {
  const [status, setStatus] = useState('checking');
  const apiClient = useMemo(() => client ?? new ApiClient(), [client]);
  useEffect(() => {
    apiClient.get<{ data: HealthViewModel }>('/health')
      .then((response) => setStatus(formatHealthStatus(response.data)))
      .catch((error: Error) => setStatus(`error: ${error.message}`));
  }, [apiClient]);
  return React.createElement(View, null, React.createElement(Text, null, status));
}
