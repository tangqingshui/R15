import { adaptWorkflowResponse } from '../workflowAdapter';

/**
 * 流程接口统一出口。
 *
 * 真实接口接入示例：
 * return fetch(`/api/workflows/${businessId}`)
 *   .then((response) => response.json())
 *   .then(transformWorkflowApiResponse);
 */
export function transformWorkflowApiResponse(response) {
  const adaptedResponse = adaptWorkflowResponse(response);
  return adaptedResponse && adaptedResponse.data
    && adaptedResponse.data.definition && adaptedResponse.data.instance
    ? adaptedResponse.data
    : adaptedResponse;
}
