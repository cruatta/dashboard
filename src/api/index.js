/*
Copyright 2019-2024 The Tekton Authors
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { useQuery } from '@tanstack/react-query';
import { labels as labelConstants } from '@tektoncd/dashboard-utils';
import deepClone from 'lodash.clonedeep';

import { useClusterTask } from './clusterTasks';
import { useTask } from './tasks';
import { get, getAPIRoot, post } from './comms';
import {
  apiRoot,
  getKubeAPI,
  getQueryParams,
  getTektonAPI,
  getTektonPipelinesAPIVersion,
  isLogTimestampsEnabled,
  useCollection,
  useResource
} from './utils';

import importResourcesPipelineRunTemplate from './resources/import-resources-pipelinerun.yaml';

export { NamespaceContext, useSelectedNamespace } from './utils';
export * from './clusterInterceptors';
export * from './clusterTasks';
export * from './clusterTriggerBindings';
export * from './customRuns';
export * from './eventListeners';
export * from './extensions';
export * from './interceptors';
export * from './pipelineRuns';
export * from './pipelines';
export * from './serviceAccounts';
export * from './taskRuns';
export * from './tasks';
export * from './triggerBindings';
export * from './triggers';
export * from './triggerTemplates';

export function getCustomResources({
  filters = [],
  involvedObjectKind,
  involvedObjectName,
  name,
  ...rest
}) {
  const { isWebSocket, group, namespace, type, version } = rest;
  const uri = getKubeAPI({
    group,
    kind: type,
    params: { isWebSocket, name, namespace },
    queryParams: getQueryParams({
      filters,
      involvedObjectKind,
      involvedObjectName,
      name
    }),
    version
  });
  return get(uri);
}

export function useCustomResources(params, queryConfig) {
  const webSocketURL = getKubeAPI({
    group: params.group,
    kind: params.type,
    params: { isWebSocket: true, namespace: params.namespace },
    queryParams: getQueryParams({ filters: params.filters }),
    version: params.version
  });
  return useCollection({
    api: getCustomResources,
    kind: params.type,
    params,
    queryConfig,
    webSocketURL
  });
}

export function getCustomResource({ group, name, namespace, type, version }) {
  const uri = getKubeAPI({
    group,
    kind: type,
    params: { name, namespace },
    version
  });
  return get(uri);
}

export function useCustomResource(params) {
  const webSocketURL = getKubeAPI({
    group: params.group,
    kind: params.type,
    params: {
      isWebSocket: true,
      name: params.name,
      namespace: params.namespace
    },
    version: params.version
  });
  return useResource({
    api: getCustomResource,
    kind: params.type,
    params,
    webSocketURL
  });
}

export function useTaskByKind({ kind, ...rest }, queryConfig) {
  if (kind === 'ClusterTask') {
    return useClusterTask({ ...rest }, queryConfig);
  }
  return useTask({ ...rest }, queryConfig);
}

export async function getInstallProperties() {
  const uri = `${getAPIRoot({ isDashboardAPI: true })}/v1/properties`;
  let data;
  try {
    data = await get(uri);
  } catch (error) {
    if (error?.response?.status === 404) {
      // eslint-disable-next-line no-console
      console.warn(
        'Install properties not found, setting client-mode defaults'
      );
      data = {
        dashboardNamespace: 'N/A',
        dashboardVersion: 'kubectl-proxy-client',
        isReadOnly: false,
        pipelinesNamespace: 'Unknown',
        pipelinesVersion: 'Unknown',
        triggersNamespace: 'Unknown',
        triggersVersion: 'Unknown'
      };
    } else {
      // eslint-disable-next-line no-console
      console.error(
        'Failed loading install properties, setting read-only default',
        error
      );
      data = { isReadOnly: true };
    }
  }
  return data;
}

function getNamespacesAPI({ isWebSocket } = {}) {
  return getKubeAPI({
    group: 'core',
    version: 'v1',
    kind: 'namespaces',
    params: { isWebSocket }
  });
}

export function getNamespaces() {
  const uri = getNamespacesAPI();
  return get(uri);
}

export function useNamespaces(queryConfig) {
  const webSocketURL = getNamespacesAPI({ isWebSocket: true });
  return useCollection({
    api: getNamespaces,
    kind: 'Namespace',
    queryConfig,
    webSocketURL
  });
}

export function usePod(params, queryConfig) {
  const group = 'core';
  const type = 'pods';
  const version = 'v1';
  const webSocketURL = getKubeAPI({
    group,
    kind: type,
    params: { ...params, isWebSocket: true },
    version
  });
  return useResource({
    api: getCustomResource,
    kind: 'customResource',
    params: { group, type, version, ...params },
    queryConfig,
    webSocketURL
  });
}

export function useEvents(
  { involvedObjectKind, involvedObjectName, namespace },
  queryConfig
) {
  const params = {
    group: 'core',
    involvedObjectKind,
    involvedObjectName,
    namespace,
    type: 'events',
    version: 'v1'
  };
  const webSocketURL = getKubeAPI({
    group: params.group,
    kind: params.type,
    params: { isWebSocket: true, namespace },
    queryParams: getQueryParams({ involvedObjectKind, involvedObjectName }),
    version: params.version
  });
  return useCollection({
    api: getCustomResources,
    kind: 'customResource',
    params,
    queryConfig,
    webSocketURL
  });
}

export function getExternalLogURL({
  completionTime,
  container,
  externalLogsURL,
  namespace,
  podName,
  startTime
}) {
  const queryParams = new URLSearchParams();
  if (startTime) {
    queryParams.set('startTime', startTime);
  }
  if (completionTime) {
    queryParams.set('completionTime', completionTime);
  }
  let queryString = queryParams.toString(); // returns the properly encoded string, or '' if no params
  if (queryString) {
    queryString = `?${queryString}`;
  }
  return `${externalLogsURL}/${namespace}/${podName}/${container}${queryString}`;
}

export function getPodLogURL({ container, name, namespace, follow }) {
  const timestamps = isLogTimestampsEnabled();
  const queryParams = {
    ...(container && { container }),
    ...(follow && { follow }),
    ...(timestamps && { timestamps })
  };
  const uri = `${getKubeAPI({
    group: 'core',
    kind: 'pods',
    params: { name, namespace, subResource: 'log' },
    queryParams,
    version: 'v1'
  })}`;
  return uri;
}

export function getPodLog({ container, name, namespace, stream }) {
  const uri = getPodLogURL({ container, name, namespace, follow: stream });
  return get(uri, { Accept: 'text/plain,*/*' }, { stream });
}

export function importResources({
  importerNamespace,
  labels,
  method,
  namespace,
  path,
  repositoryURL,
  revision,
  serviceAccount
}) {
  const pipelineRun = deepClone(importResourcesPipelineRunTemplate);
  const pipelinesAPIVersion = getTektonPipelinesAPIVersion();

  pipelineRun.apiVersion = `tekton.dev/${pipelinesAPIVersion}`;
  pipelineRun.metadata.name = `import-resources-${Date.now()}`;
  pipelineRun.metadata.labels = {
    ...labels,
    [labelConstants.DASHBOARD_IMPORT]: 'true'
  };
  pipelineRun.spec.params = [
    { name: 'method', value: method },
    { name: 'path', value: path },
    { name: 'repositoryURL', value: repositoryURL },
    { name: 'revision', value: revision },
    { name: 'target-namespace', value: namespace }
  ];

  if (pipelinesAPIVersion === 'v1beta1') {
    pipelineRun.spec.podTemplate = {
      ...pipelineRun.spec.taskRunTemplate.podTemplate
    };
    delete pipelineRun.spec.taskRunTemplate.podTemplate;
  }

  if (serviceAccount) {
    if (pipelinesAPIVersion === 'v1') {
      pipelineRun.spec.taskRunTemplate.serviceAccountName = serviceAccount;
    } else {
      pipelineRun.spec.taskRunSpecs = [
        {
          pipelineTaskName: 'fetch-repo',
          taskServiceAccountName: serviceAccount
        },
        {
          pipelineTaskName: 'import-resources',
          taskServiceAccountName: serviceAccount
        }
      ];
    }
  }

  const uri = getTektonAPI('pipelineruns', {
    namespace: importerNamespace,
    version: pipelinesAPIVersion
  });
  return post(uri, pipelineRun).then(({ body }) => body);
}

export function getAPIResource({ group, version, type }) {
  const uri = [
    apiRoot,
    group === 'core' ? `/api/${version}` : `/apis/${group}/${version}`
  ].join('');

  return get(uri).then(
    ({ resources }) => resources.find(({ name }) => name === type) || {}
  );
}

export function useAPIResource(params) {
  return useResource({
    api: getAPIResource,
    kind: params.type,
    params
  });
}

export function useProperties() {
  return useQuery(['properties'], getInstallProperties, {
    placeholderData: { isReadOnly: true }
  });
}

export function useDashboardNamespace() {
  const { data } = useProperties();
  return data.dashboardNamespace;
}

export function useExternalLogsURL() {
  const { data } = useProperties();
  return data.externalLogsURL;
}

export function useIsLogStreamingEnabled() {
  const { data } = useProperties();
  return data.streamLogs;
}

export function useIsReadOnly() {
  const { data } = useProperties();
  return data.isReadOnly;
}

export function useIsTriggersInstalled() {
  const { data } = useProperties();
  return !!(data.triggersNamespace && data.triggersVersion);
}

export function useLogoutURL() {
  const { data } = useProperties();
  return data.logoutURL;
}

export function useTenantNamespaces() {
  const { data } = useProperties();
  return data.tenantNamespaces || [];
}

export function useDefaultNamespace() {
  const { data } = useProperties();
  return data.defaultNamespace;
}
