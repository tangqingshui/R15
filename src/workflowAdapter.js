function list(value) {
  return Array.isArray(value) ? value : [];
}

function completedVirtualState(nodeId, enteredAt) {
  const state = {
    nodeId: nodeId,
    status: 'COMPLETED',
  };
  if (enteredAt !== undefined && enteredAt !== null) state.enteredAt = enteredAt;
  return state;
}

/**
 * 将后端的“真实分组节点”模型转换成流程图使用的“分组容器 + 虚拟入口/出口”模型。
 *
 * 后端模型：
 * - definition.nodes 中存在 id === group.id 的真实分组节点；
 * - 外部边和组内首尾边都可以指向 group.id；
 * - instance.nodeStates 中包含真实分组节点状态；
 * - 组内真实子节点状态和 activeNodeIds 正常返回。
 *
 * 返回模型：
 * - 移除真实分组节点及其 nodeState/activeNodeId；
 * - 自动补充 entryNodeId、exitNodeId 两个虚拟节点；
 * - 进入边改为指向 entryNodeId，离开边改为从 exitNodeId 发出；
 * - 分组处理中或已完成时，入口节点为 COMPLETED；
 * - 只有分组已完成时，出口节点才为 COMPLETED。
 *
 * 此函数是幂等的：已经是前端结构的数据再次转换不会发生变化。
 */
export function adaptWorkflowPayload(payload) {
  if (!payload || !payload.definition || !payload.instance) return payload;

  const originalDefinition = payload.definition;
  const originalInstance = payload.instance;
  const groups = list(originalDefinition.groups);
  const groupById = {};
  groups.forEach(function (group) { groupById[group.id] = group; });

  const originalNodes = list(originalDefinition.nodes);
  const originalNodeById = {};
  originalNodes.forEach(function (node) { originalNodeById[node.id] = node; });

  const nodes = originalNodes.filter(function (node) {
    return !groupById[node.id];
  }).map(function (node) {
    return Object.assign({}, node);
  });
  const addedNodeIds = {};
  nodes.forEach(function (node) { addedNodeIds[node.id] = true; });

  groups.forEach(function (group) {
    if (group.entryNodeId && !addedNodeIds[group.entryNodeId]) {
      nodes.push({
        id: group.entryNodeId,
        name: group.entryNodeName || '子流程入口',
        groupId: group.id,
      });
      addedNodeIds[group.entryNodeId] = true;
    }
    if (group.exitNodeId && !addedNodeIds[group.exitNodeId]) {
      nodes.push({
        id: group.exitNodeId,
        name: group.exitNodeName || '子流程完成',
        groupId: group.id,
      });
      addedNodeIds[group.exitNodeId] = true;
    }
  });

  const edges = list(originalDefinition.edges).map(function (edge) {
    const sourceGroup = groupById[edge.source];
    const targetGroup = groupById[edge.target];
    const sourceNode = originalNodeById[edge.source];
    const targetNode = originalNodeById[edge.target];
    const event = String(edge.event || 'PASS').toUpperCase();
    const mappedSource = sourceGroup
      ? (targetNode && targetNode.groupId === sourceGroup.id
        ? sourceGroup.entryNodeId
        : sourceGroup.exitNodeId)
      : edge.source;
    const mappedTarget = targetGroup
      ? ((sourceNode && sourceNode.groupId === targetGroup.id)
        || event === 'REJECT'
        || event === 'ROLLBACK'
        ? targetGroup.exitNodeId
        : targetGroup.entryNodeId)
      : edge.target;
    return Object.assign({}, edge, {
      source: mappedSource,
      target: mappedTarget,
    });
  });
  const edgeById = {};
  edges.forEach(function (edge) { edgeById[edge.id] = edge; });

  const originalNodeStates = list(originalInstance.nodeStates);
  const groupStateById = {};
  originalNodeStates.forEach(function (state) {
    if (groupById[state.nodeId]) groupStateById[state.nodeId] = state;
  });
  const nodeStates = originalNodeStates.filter(function (state) {
    return !groupById[state.nodeId];
  }).map(function (state) {
    return Object.assign({}, state);
  });
  const stateNodeIds = {};
  nodeStates.forEach(function (state) { stateNodeIds[state.nodeId] = true; });

  groups.forEach(function (group) {
    const groupState = groupStateById[group.id];
    if (!groupState) return;
    const status = String(groupState.status || '').toUpperCase();
    const entered = status === 'PROCESSING' || status === 'COMPLETED';
    if (entered && group.entryNodeId && !stateNodeIds[group.entryNodeId]) {
      nodeStates.push(completedVirtualState(group.entryNodeId, groupState.enteredAt));
      stateNodeIds[group.entryNodeId] = true;
    }
    if (status === 'COMPLETED' && group.exitNodeId && !stateNodeIds[group.exitNodeId]) {
      nodeStates.push(completedVirtualState(
        group.exitNodeId,
        groupState.completedAt || groupState.updatedAt || originalInstance.updatedAt || groupState.enteredAt
      ));
      stateNodeIds[group.exitNodeId] = true;
    }
  });

  const activeNodeIds = list(originalInstance.activeNodeIds).filter(function (nodeId) {
    return !groupById[nodeId];
  });

  const instance = Object.assign({}, originalInstance, {
    activeNodeIds: activeNodeIds,
    nodeStates: nodeStates,
    edgeStates: list(originalInstance.edgeStates).map(function (state) {
      return Object.assign({}, state);
    }),
  });

  if (Array.isArray(originalInstance.transitions)) {
    instance.transitions = originalInstance.transitions.map(function (transition) {
      const edge = edgeById[transition.edgeId];
      if (!edge) return Object.assign({}, transition);
      return Object.assign({}, transition, {
        fromNodeId: edge.source,
        toNodeId: edge.target,
      });
    });
  }

  return Object.assign({}, payload, {
    definition: Object.assign({}, originalDefinition, {
      nodes: nodes,
      edges: edges,
      groups: groups.map(function (group) { return Object.assign({}, group); }),
    }),
    instance: instance,
  });
}

/** 兼容项目统一响应包装：{ code, message, data: { definition, instance } }。 */
export function adaptWorkflowResponse(response) {
  if (response && response.data && response.data.definition && response.data.instance) {
    return Object.assign({}, response, { data: adaptWorkflowPayload(response.data) });
  }
  return adaptWorkflowPayload(response);
}
