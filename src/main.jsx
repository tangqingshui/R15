import React from 'react';
import ReactDOM from 'react-dom';
import dagre from '@dagrejs/dagre';
import workflow from './workflow.json';
import transitionHistoryData from './transition-history.json';
import styles from './styles.module.css';

function cx() {
  return Array.prototype.slice.call(arguments)
    .filter(Boolean)
    .map(function (className) { return styles[className]; })
    .filter(Boolean)
    .join(' ');
}

const NODE_WIDTH = 210;
const NODE_HEIGHT = 78;
const GROUP_WIDTH = 280;
const GROUP_HEIGHT = 104;
const PADDING_X = 150;
const PADDING_Y = 120;
const definition = workflow.definition;
const instance = workflow.instance;

const nodeStateById = {};
instance.nodeStates.forEach(function (state) { nodeStateById[state.nodeId] = state; });

const groupById = {};
definition.groups.forEach(function (group) { groupById[group.id] = group; });

const nodeById = {};
definition.nodes.forEach(function (node) { nodeById[node.id] = node; });

const edgeById = {};
definition.edges.forEach(function (edge) { edgeById[edge.id] = edge; });

function snapshotTransitions() {
  return instance.edgeStates.map(function (state, index) {
    const edge = edgeById[state.edgeId];
    const targetState = edge && nodeStateById[edge.target];
    return edge ? {
      transitionId: `SNAPSHOT_${String(index + 1).padStart(6, '0')}`,
      sequence: index + 1,
      edgeId: edge.id,
      event: edge.event || 'PASS',
      fromNodeId: edge.source,
      toNodeId: edge.target,
      occurredAt: (targetState && targetState.enteredAt) || instance.updatedAt,
      attempt: 1,
      reason: null,
    } : null;
  }).filter(Boolean);
}

function normalizeTransitions(records) {
  const attemptsByNodeId = {};
  return records.slice().sort(function (first, second) {
    return Number(first.sequence || 0) - Number(second.sequence || 0)
      || Number(first.occurredAt || 0) - Number(second.occurredAt || 0);
  }).map(function (record, index) {
    const edge = edgeById[record.edgeId];
    if (!edge) return null;
    const toNodeId = record.toNodeId || edge.target;
    attemptsByNodeId[toNodeId] = (attemptsByNodeId[toNodeId] || 0) + 1;
    return Object.assign({}, record, {
      sequence: Number(record.sequence || index + 1),
      event: String(record.event || edge.event || 'PASS').toUpperCase(),
      fromNodeId: record.fromNodeId || edge.source,
      toNodeId: toNodeId,
      attempt: Number(record.attempt || attemptsByNodeId[toNodeId]),
    });
  }).filter(Boolean);
}

const suppliedTransitionHistory = transitionHistoryData
  && transitionHistoryData.instanceId === instance.instanceId
  && Array.isArray(transitionHistoryData.transitions)
  ? transitionHistoryData.transitions
  : [];
const transitions = normalizeTransitions(suppliedTransitionHistory.length
  ? suppliedTransitionHistory
  : snapshotTransitions());
const hasTransitionHistory = suppliedTransitionHistory.length > 0;

const takenEdgeIds = {};
instance.edgeStates.forEach(function (edge) { takenEdgeIds[edge.edgeId] = true; });
transitions.forEach(function (transition) { takenEdgeIds[transition.edgeId] = true; });

const latestTransitionByEdgeId = {};
const transitionsByNodeId = {};
transitions.forEach(function (transition) {
  latestTransitionByEdgeId[transition.edgeId] = transition;
  if (!transitionsByNodeId[transition.toNodeId]) transitionsByNodeId[transition.toNodeId] = [];
  transitionsByNodeId[transition.toNodeId].push(transition);
});

const sequenceByNodeId = {};
sequenceByNodeId.START = 1;
transitions.forEach(function (transition) {
  sequenceByNodeId[transition.toNodeId] = transition.sequence + 1;
});
instance.nodeStates.slice().filter(function (state) { return state.enteredAt && !sequenceByNodeId[state.nodeId]; })
  .sort(function (first, second) { return first.enteredAt - second.enteredAt; })
  .forEach(function (state, index) { sequenceByNodeId[state.nodeId] = index + 1; });

const currentEdgeIds = {};
definition.edges.forEach(function (edge) {
  if (takenEdgeIds[edge.id] && instance.activeNodeIds.indexOf(edge.target) !== -1) currentEdgeIds[edge.id] = true;
});

const conditionLabels = {
  tailFirst: '尾款优先',
  taxNotCompleted: '税款未完成',
  tailCompleted: '尾款已完成',
  taxFirst: '税款优先',
  tailNotCompleted: '尾款未完成',
  taxCompleted: '税款已完成',
};

function proxyId(groupId) {
  return `GROUP__${groupId}`;
}

function rawStatus(nodeId) {
  return nodeStateById[nodeId] ? nodeStateById[nodeId].status : 'NOT_REACHED';
}

function groupStatus(group) {
  const members = definition.nodes.filter(function (node) { return node.groupId === group.id; });
  if (members.some(function (node) { return rawStatus(node.id) === 'PROCESSING'; })) return 'PROCESSING';
  if (rawStatus(group.exitNodeId) === 'COMPLETED') return 'COMPLETED';
  return 'NOT_REACHED';
}

function displayStatus(node) {
  return node.collapsedGroup ? groupStatus(node.group) : rawStatus(node.id);
}

function statusLabel(status) {
  if (status === 'COMPLETED') return '已完成';
  if (status === 'PROCESSING') return '处理中';
  return '未进入';
}

function eventLabel(event) {
  if (event === 'REJECT') return '驳回';
  if (event === 'RETRY') return '重试';
  if (event === 'ROLLBACK') return '回退';
  if (event === 'CANCEL') return '取消';
  return '正常流转';
}

function formatTime(timestamp) {
  if (!timestamp) return '尚未进入';
  return new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function roundedPath(points) {
  if (!points || points.length < 2) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    const beforeDistance = Math.sqrt(Math.pow(point.x - previous.x, 2) + Math.pow(point.y - previous.y, 2));
    const afterDistance = Math.sqrt(Math.pow(next.x - point.x, 2) + Math.pow(next.y - point.y, 2));
    const radius = Math.min(14, beforeDistance / 2, afterDistance / 2);
    const beforeRatio = radius / (beforeDistance || 1);
    const afterRatio = radius / (afterDistance || 1);
    const before = {
      x: point.x - (point.x - previous.x) * beforeRatio,
      y: point.y - (point.y - previous.y) * beforeRatio,
    };
    const after = {
      x: point.x + (next.x - point.x) * afterRatio,
      y: point.y + (next.y - point.y) * afterRatio,
    };
    path += ` L ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function spreadOffsets(count, width) {
  if (count <= 1) return [0];
  const limit = Math.min(width / 2 - 30, (count - 1) * 17);
  return Array.apply(null, Array(count)).map(function (_, index) {
    return -limit + (limit * 2 * index) / (count - 1);
  });
}

function separatePorts(edges, positionedNodes) {
  const outgoing = {};
  const incoming = {};

  edges.forEach(function (edge) {
    if (!outgoing[edge.source]) outgoing[edge.source] = [];
    if (!incoming[edge.target]) incoming[edge.target] = [];
    outgoing[edge.source].push(edge);
    incoming[edge.target].push(edge);
  });

  Object.keys(outgoing).forEach(function (sourceId) {
    const list = outgoing[sourceId].sort(function (a, b) {
      const delta = positionedNodes[a.target].x - positionedNodes[b.target].x;
      return delta || a.id.localeCompare(b.id);
    });
    const node = positionedNodes[sourceId];
    const offsets = spreadOffsets(list.length, node.width);
    list.forEach(function (edge, index) {
      edge.points[0].x = node.x + offsets[index];
      if (edge.points.length > 2) edge.points[1].x = node.x + offsets[index];
    });
  });

  Object.keys(incoming).forEach(function (targetId) {
    const list = incoming[targetId].sort(function (a, b) {
      const delta = positionedNodes[a.source].x - positionedNodes[b.source].x;
      return delta || a.id.localeCompare(b.id);
    });
    const node = positionedNodes[targetId];
    const offsets = spreadOffsets(list.length, node.width);
    list.forEach(function (edge, index) {
      const last = edge.points.length - 1;
      edge.points[last].x = node.x + offsets[index];
      if (last > 1) edge.points[last - 1].x = node.x + offsets[index];
    });
  });

  const parallel = {};
  edges.forEach(function (edge) {
    const key = `${edge.source}__${edge.target}`;
    if (!parallel[key]) parallel[key] = [];
    parallel[key].push(edge);
  });
  Object.keys(parallel).forEach(function (key) {
    const list = parallel[key];
    if (list.length < 2) return;
    const offsets = spreadOffsets(list.length, Math.max(90, list.length * 36));
    list.forEach(function (edge, index) {
      for (let pointIndex = 1; pointIndex < edge.points.length - 1; pointIndex += 1) {
        edge.points[pointIndex].x += offsets[index];
      }
    });
  });
}

function overlappingSegmentLength(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const crossStart = firstDx * (secondStart.y - firstStart.y) - firstDy * (secondStart.x - firstStart.x);
  const crossEnd = firstDx * (secondEnd.y - firstStart.y) - firstDy * (secondEnd.x - firstStart.x);
  if (Math.abs(crossStart) > 0.01 || Math.abs(crossEnd) > 0.01) return 0;

  const useX = Math.abs(firstDx) >= Math.abs(firstDy);
  const firstValues = useX ? [firstStart.x, firstEnd.x] : [firstStart.y, firstEnd.y];
  const secondValues = useX ? [secondStart.x, secondEnd.x] : [secondStart.y, secondEnd.y];
  return Math.min(Math.max.apply(null, firstValues), Math.max.apply(null, secondValues))
    - Math.max(Math.min.apply(null, firstValues), Math.min.apply(null, secondValues));
}

function routesOverlap(first, second) {
  for (let firstIndex = 0; firstIndex < first.points.length - 1; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.points.length - 1; secondIndex += 1) {
      if (overlappingSegmentLength(
        first.points[firstIndex],
        first.points[firstIndex + 1],
        second.points[secondIndex],
        second.points[secondIndex + 1]
      ) > 2) return true;
    }
  }
  return false;
}

function orientation(first, second, third) {
  return (second.x - first.x) * (third.y - first.y) - (second.y - first.y) * (third.x - first.x);
}

function pointInsideRect(point, rect) {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

function segmentIntersectsRect(start, end, rect) {
  if (pointInsideRect(start, rect) || pointInsideRect(end, rect)) return true;
  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  for (let index = 0; index < corners.length; index += 1) {
    const first = corners[index];
    const second = corners[(index + 1) % corners.length];
    const firstSide = orientation(start, end, first);
    const secondSide = orientation(start, end, second);
    const startSide = orientation(first, second, start);
    const endSide = orientation(first, second, end);
    if (((firstSide > 0 && secondSide < 0) || (firstSide < 0 && secondSide > 0))
      && ((startSide > 0 && endSide < 0) || (startSide < 0 && endSide > 0))) return true;
  }
  return false;
}

function routeHitsNode(edge, points, positionedNodes) {
  const nodes = Object.keys(positionedNodes).map(function (id) { return positionedNodes[id]; });
  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = nodes[nodeIndex];
      if (node.id === edge.source || node.id === edge.target) continue;
      const rect = {
        left: node.x - node.width / 2 - 4,
        right: node.x + node.width / 2 + 4,
        top: node.y - node.height / 2 - 4,
        bottom: node.y + node.height / 2 + 4,
      };
      if (segmentIntersectsRect(points[pointIndex], points[pointIndex + 1], rect)) return true;
    }
  }
  return false;
}

function deoverlapRoutes(edges, positionedNodes) {
  const conflicts = edges.map(function () { return {}; });
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex += 1) {
      if (routesOverlap(edges[firstIndex], edges[secondIndex])) {
        conflicts[firstIndex][secondIndex] = true;
        conflicts[secondIndex][firstIndex] = true;
      }
    }
  }

  const laneSequence = [0, 14, -14, 28, -28, 42, -42, 56, -56, 70, -70, 84, -84];
  const assignedLanes = [];
  edges.forEach(function (edge, edgeIndex) {
    const used = {};
    Object.keys(conflicts[edgeIndex]).forEach(function (otherIndex) {
      if (assignedLanes[otherIndex] !== undefined) used[assignedLanes[otherIndex]] = true;
    });
    const lane = laneSequence.find(function (candidate) {
      if (used[candidate]) return false;
      const candidatePoints = edge.points.map(function (point, pointIndex) {
        if (pointIndex === 0 || pointIndex === edge.points.length - 1) return Object.assign({}, point);
        return { x: point.x + candidate, y: point.y };
      });
      return !routeHitsNode(edge, candidatePoints, positionedNodes);
    });
    const safeLane = lane === undefined ? 0 : lane;
    assignedLanes[edgeIndex] = safeLane;
    if (!safeLane) return;
    for (let pointIndex = 1; pointIndex < edge.points.length - 1; pointIndex += 1) {
      edge.points[pointIndex].x += safeLane;
    }
    if (edge.x !== undefined) edge.x += safeLane;
  });
}

function buildGroupLayout(group) {
  const members = definition.nodes.filter(function (node) { return node.groupId === group.id; });
  const memberIds = {};
  members.forEach(function (node) { memberIds[node.id] = true; });
  const internalEdges = definition.edges.filter(function (edge) {
    return memberIds[edge.source] && memberIds[edge.target];
  });
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: 'TB',
    ranksep: 82,
    nodesep: 76,
    edgesep: 34,
    marginx: 18,
    marginy: 18,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });
  graph.setDefaultEdgeLabel(function () { return {}; });

  members.forEach(function (node) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  internalEdges.forEach(function (edge) {
    graph.setEdge(edge.source, edge.target, {
      width: edge.condition ? 98 : 0,
      height: edge.condition ? 28 : 0,
      labelpos: 'c',
    }, edge.id);
  });
  dagre.layout(graph);

  const graphSize = graph.graph();
  const width = Math.max(700, graphSize.width + 116);
  const height = graphSize.height + 132;
  const offsetX = (width - graphSize.width) / 2;
  const offsetY = 72;
  const positionedNodes = {};
  members.forEach(function (node) {
    const position = graph.node(node.id);
    positionedNodes[node.id] = Object.assign({}, node, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      x: position.x + offsetX,
      y: position.y + offsetY,
    });
  });

  const positionedEdges = internalEdges.map(function (edge) {
    const route = graph.edge({ v: edge.source, w: edge.target, name: edge.id });
    return Object.assign({}, edge, {
      taken: Boolean(takenEdgeIds[edge.id]),
      points: route.points.map(function (point) { return { x: point.x + offsetX, y: point.y + offsetY }; }),
      x: route.x === undefined ? undefined : route.x + offsetX,
      y: route.y === undefined ? undefined : route.y + offsetY,
    });
  });
  separatePorts(positionedEdges, positionedNodes);
  deoverlapRoutes(positionedEdges, positionedNodes);

  return {
    width: width,
    height: height,
    nodes: Object.keys(positionedNodes).map(function (id) { return positionedNodes[id]; }),
    edges: positionedEdges,
  };
}

function buildLayout(collapsedGroups) {
  const groupLayouts = {};
  definition.groups.forEach(function (group) {
    if (!collapsedGroups[group.id]) groupLayouts[group.id] = buildGroupLayout(group);
  });

  const leadingNodes = definition.nodes.filter(function (node) {
    return !node.groupId && node.id !== 'TAIL_CI_PENDING' && node.id !== 'REPAYMENT_PENDING';
  });
  const stages = leadingNodes.map(function (node) { return { type: 'node', node: node }; });
  definition.groups.slice().sort(function (first, second) { return first.order - second.order; }).forEach(function (group) {
    if (group.order === 1) stages.push({ type: 'group', group: group });
    if (group.order === 2) {
      if (nodeById.TAIL_CI_PENDING) stages.push({ type: 'node', node: nodeById.TAIL_CI_PENDING });
      stages.push({ type: 'group', group: group });
    }
    if (group.order === 3) stages.push({ type: 'group', group: group });
  });
  if (nodeById.REPAYMENT_PENDING) stages.push({ type: 'node', node: nodeById.REPAYMENT_PENDING });

  const widestStage = Math.max.apply(null, stages.map(function (stage) {
    if (stage.type === 'node') return NODE_WIDTH;
    return collapsedGroups[stage.group.id] ? GROUP_WIDTH : groupLayouts[stage.group.id].width;
  }));
  const contentWidth = widestStage + 640;
  const centerX = contentWidth / 2;
  const positionedNodes = {};
  const positionedEdges = [];
  const positionedGroups = [];
  const sectionByIndex = {};
  let cursorY = 36;

  stages.forEach(function (stage, stageIndex) {
    if (stage.type === 'node') {
      const node = Object.assign({}, stage.node, {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        x: centerX,
        y: cursorY + NODE_HEIGHT / 2,
        sectionIndex: stageIndex,
      });
      positionedNodes[node.id] = node;
      sectionByIndex[stageIndex] = { top: cursorY, bottom: cursorY + NODE_HEIGHT };
      cursorY += NODE_HEIGHT + 112;
      return;
    }

    const group = stage.group;
    if (collapsedGroups[group.id]) {
      const collapsedNode = {
        id: proxyId(group.id),
        name: group.name,
        groupId: group.id,
        group: group,
        collapsedGroup: true,
        width: GROUP_WIDTH,
        height: GROUP_HEIGHT,
        x: centerX,
        y: cursorY + GROUP_HEIGHT / 2,
        sectionIndex: stageIndex,
      };
      positionedNodes[collapsedNode.id] = collapsedNode;
      sectionByIndex[stageIndex] = { top: cursorY, bottom: cursorY + GROUP_HEIGHT };
      cursorY += GROUP_HEIGHT + 122;
      return;
    }

    const groupLayout = groupLayouts[group.id];
    const groupX = centerX - groupLayout.width / 2;
    positionedGroups.push(Object.assign({}, group, {
      x: groupX,
      y: cursorY,
      width: groupLayout.width,
      height: groupLayout.height,
    }));
    groupLayout.nodes.forEach(function (node) {
      positionedNodes[node.id] = Object.assign({}, node, {
        x: node.x + groupX,
        y: node.y + cursorY,
        sectionIndex: stageIndex,
      });
    });
    groupLayout.edges.forEach(function (edge) {
      positionedEdges.push(Object.assign({}, edge, {
        points: edge.points.map(function (point) { return { x: point.x + groupX, y: point.y + cursorY }; }),
        x: edge.x === undefined ? undefined : edge.x + groupX,
        y: edge.y === undefined ? undefined : edge.y + cursorY,
      }));
    });
    sectionByIndex[stageIndex] = { top: cursorY, bottom: cursorY + groupLayout.height };
    cursorY += groupLayout.height + 122;
  });

  function mappedNodeId(originalId) {
    const original = nodeById[originalId];
    if (original && original.groupId && collapsedGroups[original.groupId]) return proxyId(original.groupId);
    return originalId;
  }

  const internalEdgeIds = {};
  positionedEdges.forEach(function (edge) { internalEdgeIds[edge.id] = true; });
  const externalEdges = definition.edges.map(function (edge) {
    return Object.assign({}, edge, {
      source: mappedNodeId(edge.source),
      target: mappedNodeId(edge.target),
      taken: Boolean(takenEdgeIds[edge.id]),
    });
  }).filter(function (edge) {
    return edge.source !== edge.target && !internalEdgeIds[edge.id];
  });

  const outgoing = {};
  const incoming = {};
  externalEdges.forEach(function (edge) {
    if (!outgoing[edge.source]) outgoing[edge.source] = [];
    if (!incoming[edge.target]) incoming[edge.target] = [];
    outgoing[edge.source].push(edge);
    incoming[edge.target].push(edge);
  });
  const outgoingOffset = {};
  const incomingOffset = {};
  Object.keys(outgoing).forEach(function (nodeId) {
    const list = outgoing[nodeId].sort(function (first, second) { return first.id.localeCompare(second.id); });
    const offsets = spreadOffsets(list.length, positionedNodes[nodeId].width);
    list.forEach(function (edge, index) { outgoingOffset[edge.id] = offsets[index]; });
  });
  Object.keys(incoming).forEach(function (nodeId) {
    const list = incoming[nodeId].sort(function (first, second) { return first.id.localeCompare(second.id); });
    const offsets = spreadOffsets(list.length, positionedNodes[nodeId].width);
    list.forEach(function (edge, index) { incomingOffset[edge.id] = offsets[index]; });
  });

  let leftLaneIndex = 0;
  let rightLaneIndex = 0;
  const leftRail = centerX - widestStage / 2 - 96;
  const rightRail = centerX + widestStage / 2 + 96;
  externalEdges.forEach(function (edge) {
    const source = positionedNodes[edge.source];
    const target = positionedNodes[edge.target];
    const start = { x: source.x + (outgoingOffset[edge.id] || 0), y: source.y + source.height / 2 };
    const end = { x: target.x + (incomingOffset[edge.id] || 0), y: target.y - target.height / 2 };
    const isDirect = target.sectionIndex === source.sectionIndex + 1;
    let points;
    let labelX;
    let labelY;

    if (isDirect) {
      const middleY = (start.y + end.y) / 2;
      points = Math.abs(start.x - end.x) < 0.5
        ? [start, end]
        : [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
      labelX = (start.x + end.x) / 2;
      labelY = middleY;
    } else {
      const isBackward = target.sectionIndex <= source.sectionIndex;
      const railX = isBackward
        ? rightRail + rightLaneIndex++ * 58
        : leftRail - leftLaneIndex++ * 58;
      const sourceSection = sectionByIndex[source.sectionIndex];
      const targetSection = sectionByIndex[target.sectionIndex];
      const sourceGapY = sourceSection.bottom + 36;
      const targetGapY = targetSection.top - 36;
      points = [
        start,
        { x: start.x, y: sourceGapY },
        { x: railX, y: sourceGapY },
        { x: railX, y: targetGapY },
        { x: end.x, y: targetGapY },
        end,
      ];
      labelX = railX;
      labelY = (sourceGapY + targetGapY) / 2;
    }

    positionedEdges.push(Object.assign({}, edge, {
      points: points,
      x: edge.condition ? labelX : undefined,
      y: edge.condition ? labelY : undefined,
    }));
  });

  return {
    nodes: Object.keys(positionedNodes).map(function (id) { return positionedNodes[id]; }),
    edges: positionedEdges.sort(function (first, second) {
      return Number(first.taken) - Number(second.taken)
        || Number(Boolean(currentEdgeIds[first.id])) - Number(Boolean(currentEdgeIds[second.id]));
    }),
    groups: positionedGroups,
    width: contentWidth + PADDING_X * 2,
    height: cursorY + PADDING_Y * 2,
  };
}

function topView(layout) {
  const width = Math.min(layout.width, 1760);
  const height = Math.min(layout.height, 1050);
  return { x: (layout.width - width) / 2, y: 0, width: width, height: height };
}

const initiallyCollapsedGroups = {};
definition.groups.forEach(function (group) { initiallyCollapsedGroups[group.id] = true; });
const initialLayout = buildLayout(initiallyCollapsedGroups);

function buildMotionPath(layout) {
  const positionedNodes = {};
  layout.nodes.forEach(function (node) { positionedNodes[node.id] = node; });
  const visibleNodeIds = {};
  layout.nodes.forEach(function (node) { visibleNodeIds[node.id] = true; });

  function visibleNodeId(originalId) {
    const originalNode = nodeById[originalId];
    if (originalNode && originalNode.groupId && visibleNodeIds[proxyId(originalNode.groupId)]) {
      return proxyId(originalNode.groupId);
    }
    return originalId;
  }

  const points = [];
  let cursorId = null;
  transitions.forEach(function (transition) {
    const sourceId = visibleNodeId(transition.fromNodeId);
    const targetId = visibleNodeId(transition.toNodeId);
    if (sourceId === targetId || !positionedNodes[sourceId] || !positionedNodes[targetId]) return;
    if (!points.length || cursorId !== sourceId) {
      points.push({ x: positionedNodes[sourceId].x, y: positionedNodes[sourceId].y });
    }
    const edge = layout.edges.find(function (candidate) { return candidate.id === transition.edgeId; })
      || layout.edges.find(function (candidate) {
        return candidate.source === sourceId && candidate.target === targetId;
      });
    if (!edge) return;
    edge.points.forEach(function (point) {
      const previous = points[points.length - 1];
      if (!previous || previous.x !== point.x || previous.y !== point.y) points.push({ x: point.x, y: point.y });
    });
    const target = positionedNodes[targetId];
    points.push({ x: target.x, y: target.y });
    cursorId = targetId;
  });

  return roundedPath(points);
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      collapsedGroups: Object.assign({}, initiallyCollapsedGroups),
      viewBox: { x: 0, y: 0, width: initialLayout.width, height: initialLayout.height },
      selectedId: 'START',
      traceMode: true,
      playbackRunning: true,
      motionKey: 0,
    };
    this.currentLayout = initialLayout;
    this.drag = null;
    this.svg = null;
    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.endDrag = this.endDrag.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.zoomIn = this.zoomIn.bind(this);
    this.zoomOut = this.zoomOut.bind(this);
    this.fitGraph = this.fitGraph.bind(this);
    this.collapseAll = this.collapseAll.bind(this);
    this.expandAll = this.expandAll.bind(this);
    this.selectNode = this.selectNode.bind(this);
    this.toggleTraceMode = this.toggleTraceMode.bind(this);
    this.focusCurrent = this.focusCurrent.bind(this);
    this.skipPlayback = this.skipPlayback.bind(this);
    this.replayPlayback = this.replayPlayback.bind(this);
    this.finishPlayback = this.finishPlayback.bind(this);
    this.startMotion = this.startMotion.bind(this);
  }

  componentDidMount() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.skipPlayback();
      return;
    }
    this.startMotion();
  }

  componentWillUnmount() {
    if (this.motionFrame) window.cancelAnimationFrame(this.motionFrame);
  }

  startMotion() {
    if (this.motionFrame) window.cancelAnimationFrame(this.motionFrame);
    const path = this.motionPathElement;
    const traveler = this.travelerElement;
    if (!path || !traveler) {
      this.motionFrame = window.requestAnimationFrame(this.startMotion);
      return;
    }
    const totalLength = path.getTotalLength();
    const duration = 1800;
    const startedAt = window.performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const point = path.getPointAtLength(totalLength * progress);
      traveler.setAttribute('transform', `translate(${point.x} ${point.y})`);
      if (progress < 1) this.motionFrame = window.requestAnimationFrame(tick);
      else this.finishPlayback();
    };
    this.motionFrame = window.requestAnimationFrame(tick);
  }

  finishPlayback() {
    this.setState({
      playbackRunning: false,
      selectedId: instance.activeNodeIds[0] || 'START',
    });
  }

  skipPlayback() {
    if (this.motionFrame) window.cancelAnimationFrame(this.motionFrame);
    this.setState({
      playbackRunning: false,
      selectedId: instance.activeNodeIds[0] || 'START',
    });
  }

  replayPlayback() {
    if (this.motionFrame) window.cancelAnimationFrame(this.motionFrame);
    const collapsed = Object.assign({}, initiallyCollapsedGroups);
    const layout = buildLayout(collapsed);
    this.currentLayout = layout;
    this.setState({
      collapsedGroups: collapsed,
      viewBox: { x: 0, y: 0, width: layout.width, height: layout.height },
      selectedId: 'START',
      traceMode: true,
      playbackRunning: true,
      motionKey: this.state.motionKey + 1,
    }, () => {
      this.startMotion();
    });
  }

  setCollapsedGroups(nextCollapsed) {
    const nextLayout = buildLayout(nextCollapsed);
    this.currentLayout = nextLayout;
    this.setState({
      collapsedGroups: nextCollapsed,
      viewBox: topView(nextLayout),
    });
  }

  toggleGroup(groupId) {
    if (this.state.playbackRunning) this.skipPlayback();
    const nextCollapsed = Object.assign({}, this.state.collapsedGroups);
    nextCollapsed[groupId] = !nextCollapsed[groupId];
    this.setCollapsedGroups(nextCollapsed);
  }

  collapseAll() {
    if (this.state.playbackRunning) this.skipPlayback();
    const nextCollapsed = {};
    definition.groups.forEach(function (group) { nextCollapsed[group.id] = true; });
    this.setCollapsedGroups(nextCollapsed);
  }

  expandAll() {
    if (this.state.playbackRunning) this.skipPlayback();
    this.setCollapsedGroups({});
  }

  selectNode(nodeId) {
    if (this.state.playbackRunning) this.skipPlayback();
    this.setState({ selectedId: nodeId });
  }

  toggleTraceMode() {
    if (this.state.playbackRunning) this.skipPlayback();
    this.setState(function (previous) { return { traceMode: !previous.traceMode }; });
  }

  focusNode(nodeId) {
    const layout = this.currentLayout;
    const node = layout.nodes.find(function (candidate) { return candidate.id === nodeId; });
    if (!node) return;
    const width = Math.min(920, layout.width);
    const height = Math.min(650, layout.height);
    this.setState({
      selectedId: nodeId,
      viewBox: {
        x: node.x + PADDING_X - width / 2,
        y: node.y + PADDING_Y - height / 2,
        width: width,
        height: height,
      },
    });
  }

  focusCurrent() {
    if (this.state.playbackRunning) this.skipPlayback();
    const activeId = instance.activeNodeIds[0];
    if (activeId) this.focusNode(activeId);
  }

  fitGraph() {
    const layout = this.currentLayout;
    this.setState({ viewBox: { x: 0, y: 0, width: layout.width, height: layout.height } });
  }

  zoom(factor, center) {
    const layout = this.currentLayout;
    this.setState(function (previous) {
      const view = previous.viewBox;
      const nextWidth = Math.max(500, Math.min(layout.width * 1.25, view.width * factor));
      const nextHeight = Math.max(340, Math.min(layout.height * 1.25, view.height * factor));
      const centerX = center ? center.x : view.x + view.width / 2;
      const centerY = center ? center.y : view.y + view.height / 2;
      const ratioX = center ? (centerX - view.x) / view.width : 0.5;
      const ratioY = center ? (centerY - view.y) / view.height : 0.5;
      return {
        viewBox: {
          x: centerX - nextWidth * ratioX,
          y: centerY - nextHeight * ratioY,
          width: nextWidth,
          height: nextHeight,
        },
      };
    });
  }

  zoomIn() { this.zoom(0.82); }
  zoomOut() { this.zoom(1.22); }

  handleWheel(event) {
    event.preventDefault();
    if (!this.svg) return;
    const rect = this.svg.getBoundingClientRect();
    const view = this.state.viewBox;
    this.zoom(event.deltaY > 0 ? 1.1 : 0.9, {
      x: view.x + ((event.clientX - rect.left) / rect.width) * view.width,
      y: view.y + ((event.clientY - rect.top) / rect.height) * view.height,
    });
  }

  beginDrag(clientX, clientY) {
    this.drag = { clientX: clientX, clientY: clientY, viewBox: Object.assign({}, this.state.viewBox) };
  }

  moveDrag(clientX, clientY) {
    if (!this.drag || !this.svg) return;
    const rect = this.svg.getBoundingClientRect();
    const dx = ((clientX - this.drag.clientX) / rect.width) * this.drag.viewBox.width;
    const dy = ((clientY - this.drag.clientY) / rect.height) * this.drag.viewBox.height;
    this.setState({
      viewBox: Object.assign({}, this.drag.viewBox, {
        x: this.drag.viewBox.x - dx,
        y: this.drag.viewBox.y - dy,
      }),
    });
  }

  handleMouseDown(event) {
    if (event.button === 0) this.beginDrag(event.clientX, event.clientY);
  }

  handleMouseMove(event) { this.moveDrag(event.clientX, event.clientY); }
  endDrag() { this.drag = null; }

  handleTouchStart(event) {
    if (event.touches.length === 1) this.beginDrag(event.touches[0].clientX, event.touches[0].clientY);
  }

  handleTouchMove(event) {
    if (event.touches.length === 1) {
      event.preventDefault();
      this.moveDrag(event.touches[0].clientX, event.touches[0].clientY);
    }
  }

  renderGroup(group) {
    const toggle = (event) => {
      event.stopPropagation();
      this.toggleGroup(group.id);
    };
    return (
      <g key={group.id} className={cx('group-region', `group-region-${group.order}`)}>
        <rect className={cx('group-background')} x={group.x} y={group.y} width={group.width} height={group.height} rx="28" />
        <g
          className={cx('group-toggle')}
          transform={`translate(${group.x + 22}, ${group.y + 18})`}
          role="button"
          tabIndex="0"
          aria-label={`收起${group.name}`}
          onMouseDown={function (event) { event.stopPropagation(); }}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggle(event);
            }
          }}
        >
          <rect width="178" height="38" rx="12" />
          <text x="14" y="24"><tspan className={cx('group-number')}>0{group.order}</tspan><tspan dx="9">{group.name}</tspan></text>
          <path d="M 151 22 L 157 16 L 163 22" />
        </g>
      </g>
    );
  }

  renderEdge(edge) {
    const current = Boolean(currentEdgeIds[edge.id]);
    const related = edge.source === this.state.selectedId || edge.target === this.state.selectedId;
    const transition = latestTransitionByEdgeId[edge.id];
    const event = String((transition && transition.event) || edge.event || 'PASS').toUpperCase();
    const edgeClass = cx(
      'edge-route',
      edge.taken ? 'edge-taken' : 'edge-untaken',
      `edge-event-${event.toLowerCase()}`,
      current ? 'edge-current' : '',
      related ? 'edge-related' : '',
    );
    const path = roundedPath(edge.points);
    let marker = current ? 'url(#arrow-current)' : (edge.taken ? 'url(#arrow-taken)' : 'url(#arrow-untaken)');
    if (edge.taken && event === 'REJECT') marker = 'url(#arrow-reject)';
    if (edge.taken && event === 'RETRY') marker = 'url(#arrow-retry)';
    if (edge.taken && event === 'ROLLBACK') marker = 'url(#arrow-rollback)';
    return (
      <g key={edge.id} className={edgeClass}>
        <path className={cx('edge-casing')} d={path} />
        <path className={cx('edge-stroke')} d={path} markerEnd={marker} />
      </g>
    );
  }

  renderEdgeLabel(edge) {
    const transition = latestTransitionByEdgeId[edge.id];
    const event = String((transition && transition.event) || edge.event || 'PASS').toUpperCase();
    const label = edge.condition ? (conditionLabels[edge.condition] || edge.condition) : (event === 'PASS' ? '' : eventLabel(event));
    if (!label) return null;
    const middlePoint = edge.points[Math.floor(edge.points.length / 2)];
    const x = edge.x === undefined ? middlePoint.x : edge.x;
    const y = edge.y === undefined ? middlePoint.y : edge.y;
    return (
      <g key={`label-${edge.id}`} className={cx('condition-label', edge.taken ? 'condition-taken' : '', currentEdgeIds[edge.id] ? 'condition-current' : '', event !== 'PASS' ? `condition-${event.toLowerCase()}` : '')} transform={`translate(${x}, ${y})`}>
        <rect x="-51" y="-14" width="102" height="28" rx="14" />
        <text textAnchor="middle" dominantBaseline="central">{label}</text>
      </g>
    );
  }

  renderNode(node) {
    const status = displayStatus(node);
    const active = node.collapsedGroup
      ? definition.nodes.some(function (member) { return member.groupId === node.groupId && instance.activeNodeIds.indexOf(member.id) !== -1; })
      : instance.activeNodeIds.indexOf(node.id) !== -1;
    const width = node.width;
    const height = node.height;
    const selected = this.state.selectedId === node.id;
    const nodeClass = cx(
      'flow-node',
      `node-${status.toLowerCase()}`,
      active ? 'node-active' : '',
      selected ? 'node-selected' : '',
      node.collapsedGroup ? 'collapsed-group-node' : ''
    );
    const activate = (event) => {
      event.stopPropagation();
      if (node.collapsedGroup) this.toggleGroup(node.groupId);
      else this.selectNode(node.id);
    };
    const sequence = node.collapsedGroup ? `0${node.group.order}` : sequenceByNodeId[node.id];
    const visitCount = node.collapsedGroup ? 0 : (transitionsByNodeId[node.id] || []).length;

    return (
      <g
        key={node.id}
        className={nodeClass}
        transform={`translate(${node.x}, ${node.y})`}
        role="button"
        tabIndex="0"
        aria-label={node.collapsedGroup ? `展开${node.name}` : `${node.name}，${statusLabel(status)}`}
        onMouseDown={function (event) { event.stopPropagation(); }}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate(event);
          }
        }}
      >
        {active ? <rect className={cx('active-halo')} x={-width / 2 - 8} y={-height / 2 - 8} width={width + 16} height={height + 16} rx="22" /> : null}
        <rect className={cx('node-card')} x={-width / 2} y={-height / 2} width={width} height={height} rx="17" />
        <rect className={cx('node-accent')} x={-width / 2} y={-height / 2 + 14} width="4" height={height - 28} rx="2" />
        <circle className={cx('step-circle')} cx={-width / 2 + 28} cy="0" r="16" />
        <text className={cx('step-number')} x={-width / 2 + 28} y="1" textAnchor="middle" dominantBaseline="central">{sequence ? String(sequence).padStart(2, '0') : '—'}</text>
        {status === 'PROCESSING' ? <circle className={cx('pulse-ring')} cx={-width / 2 + 28} cy="0" r="20" /> : null}
        <foreignObject x={-width / 2 + 54} y={-height / 2 + 10} width={width - (node.collapsedGroup ? 105 : 68)} height={height - 20}>
          <div className={cx('node-copy')} xmlns="http://www.w3.org/1999/xhtml">
            <strong>{node.name}</strong>
            <span className={cx('node-state-line')}><i />{node.collapsedGroup ? `${statusLabel(status)} · 点击展开` : `${statusLabel(status)}${visitCount > 1 ? ` · 第 ${visitCount} 次进入` : ''}`}</span>
          </div>
        </foreignObject>
        {node.collapsedGroup ? (
          <g className={cx('expand-icon')} transform={`translate(${width / 2 - 43}, -15)`}>
            <rect width="30" height="30" rx="9" />
            <path d="M 9 17 L 15 11 L 21 17" />
          </g>
        ) : null}
      </g>
    );
  }

  renderNodeDetail(layout) {
    const node = layout.nodes.find((candidate) => candidate.id === this.state.selectedId)
      || layout.nodes.find((candidate) => instance.activeNodeIds.indexOf(candidate.id) !== -1);
    if (!node) return null;
    const status = displayStatus(node);
    const group = node.groupId ? groupById[node.groupId] : null;
    const state = node.collapsedGroup ? nodeStateById[node.group.exitNodeId] : nodeStateById[node.id];
    const incoming = node.collapsedGroup
      ? definition.edges.filter((edge) => nodeById[edge.target].groupId === node.groupId && nodeById[edge.source].groupId !== node.groupId)
      : definition.edges.filter((edge) => edge.target === node.id);
    const outgoing = node.collapsedGroup
      ? definition.edges.filter((edge) => nodeById[edge.source].groupId === node.groupId && nodeById[edge.target].groupId !== node.groupId)
      : definition.edges.filter((edge) => edge.source === node.id);
    const active = node.collapsedGroup
      ? definition.nodes.some((member) => member.groupId === node.groupId && instance.activeNodeIds.indexOf(member.id) !== -1)
      : instance.activeNodeIds.indexOf(node.id) !== -1;
    const nodeTransitions = node.collapsedGroup
      ? transitions.filter((transition) => nodeById[transition.toNodeId] && nodeById[transition.toNodeId].groupId === node.groupId)
      : (transitionsByNodeId[node.id] || []);
    const lastTransition = nodeTransitions[nodeTransitions.length - 1];

    return (
      <aside className={cx('node-detail', `detail-${status.toLowerCase()}`)}>
        <div className={cx('detail-status-row')}>
          <span className={cx('detail-status')}><i />{active ? '当前处理节点' : statusLabel(status)}</span>
          <span className={cx('detail-sequence')}>{node.collapsedGroup ? `分组 0${node.group.order}` : (sequenceByNodeId[node.id] ? `第 ${sequenceByNodeId[node.id]} 步` : '候选节点')}</span>
        </div>
        <h3>{node.name}</h3>
        <p>{node.collapsedGroup ? node.group.id : node.id}</p>
        <div className={cx('detail-facts')}>
          <span><small>进入时间</small><strong>{formatTime(state && state.enteredAt)}</strong></span>
          <span><small>所属阶段</small><strong>{group ? group.name : '主流程'}</strong></span>
          <span><small>进入次数 / 最近动作</small><strong>{nodeTransitions.length || '—'} / {lastTransition ? eventLabel(lastTransition.event) : '—'}</strong></span>
          <span><small>流入 / 流出</small><strong>{incoming.length} / {outgoing.length}</strong></span>
        </div>
        <button type="button" onClick={() => this.focusNode(node.id)}>定位节点</button>
      </aside>
    );
  }

  render() {
    const layout = buildLayout(this.state.collapsedGroups);
    this.currentLayout = layout;
    const motionPath = buildMotionPath(layout);
    const view = this.state.viewBox;
    const allCollapsed = definition.groups.every((group) => this.state.collapsedGroups[group.id]);
    const anyCollapsed = definition.groups.some((group) => this.state.collapsedGroups[group.id]);

    return (
      <main className={cx('flowchart-only', this.state.traceMode ? 'trace-mode' : 'definition-mode', this.state.playbackRunning ? 'playback-running' : 'playback-finished')}>
        <div className={cx('canvas-controls')} aria-label="流程图控制">
          {this.state.playbackRunning ? <button type="button" className={cx('text-control', 'skip-control')} onClick={this.skipPlayback}>跳过动画</button> : <button type="button" className={cx('text-control', 'replay-control')} onClick={this.replayPlayback}>重新播放</button>}
          <span className={cx('control-divider')} />
          <button type="button" className={cx('trace-control', this.state.traceMode ? 'is-active' : '')} aria-pressed={this.state.traceMode} onClick={this.toggleTraceMode}><i />运行轨迹</button>
          <button type="button" className={cx('text-control', 'current-control')} onClick={this.focusCurrent}>定位当前</button>
          <span className={cx('control-divider')} />
          {anyCollapsed ? <button type="button" className={cx('text-control')} onClick={this.expandAll}>全部展开</button> : null}
          {!allCollapsed ? <button type="button" className={cx('text-control')} onClick={this.collapseAll}>全部收起</button> : null}
          <span className={cx('control-divider')} />
          <button type="button" onClick={this.zoomIn} aria-label="放大">＋</button>
          <button type="button" onClick={this.zoomOut} aria-label="缩小">−</button>
          <button type="button" className={cx('fit-control')} onClick={this.fitGraph}>适应画布</button>
        </div>

        <svg
          ref={(element) => { this.svg = element; }}
          className={cx('workflow-canvas')}
          viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
          preserveAspectRatio="xMidYMid meet"
          onWheel={this.handleWheel}
          onMouseDown={this.handleMouseDown}
          onMouseMove={this.handleMouseMove}
          onMouseUp={this.endDrag}
          onMouseLeave={this.endDrag}
          onTouchStart={this.handleTouchStart}
          onTouchMove={this.handleTouchMove}
          onTouchEnd={this.endDrag}
          role="img"
          aria-label={`${definition.processName}竖向流程图`}
        >
          <defs>
            <marker id="arrow-taken" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path className={cx('arrow-taken')} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-untaken" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path className={cx('arrow-untaken')} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-current" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className={cx('arrow-current')} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-reject" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className={cx('arrow-reject')} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-retry" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className={cx('arrow-retry')} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
            <marker id="arrow-rollback" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path className={cx('arrow-rollback')} d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>
          <g transform={`translate(${PADDING_X}, ${PADDING_Y})`}>
            {layout.groups.map(this.renderGroup.bind(this))}
            {layout.edges.map(this.renderEdge.bind(this))}
            {layout.edges.map(this.renderEdgeLabel.bind(this))}
            {layout.nodes.map(this.renderNode.bind(this))}
            {this.state.playbackRunning && motionPath ? (
              <g key={this.state.motionKey} aria-hidden="true">
                <path ref={(element) => { this.motionPathElement = element; }} className={cx('motion-path')} d={motionPath} />
                <g
                  ref={(element) => { this.travelerElement = element; }}
                  className={cx('route-traveler')}
                  transform={`translate(${layout.nodes.find((node) => node.id === 'START').x} ${layout.nodes.find((node) => node.id === 'START').y})`}
                >
                  <circle className={cx('traveler-dot')} r="7" />
                </g>
              </g>
            ) : null}
          </g>
        </svg>

        <div className={cx('flow-legend')}>
          <span><i className={cx('legend-node', 'legend-completed')} />已完成</span>
          <span><i className={cx('legend-node', 'legend-current')} />当前节点</span>
          <span><i className={cx('legend-node', 'legend-pending')} />候选节点</span>
          <span><i className={cx('legend-line', 'legend-taken')} />已流转</span>
          <span><i className={cx('legend-line', 'legend-candidate')} />候选路径</span>
          <span><i className={cx('legend-line', 'legend-reject')} />驳回 / 回退</span>
          <span><i className={cx('legend-line', 'legend-retry')} />重试</span>
        </div>
        {this.state.playbackRunning ? null : this.renderNodeDetail(layout)}
      </main>
    );
  }
}

if (typeof document !== 'undefined') {
  ReactDOM.render(<App />, document.getElementById('root'));
}

export { buildLayout, buildMotionPath, normalizeTransitions, transitions, hasTransitionHistory };
