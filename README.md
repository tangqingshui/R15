# 流程观测台（React 15）

基于 `process-data-simplified.json` 的流程图页面，展示流程定义、子流程分组、已执行路径和当前节点。

前端同时支持两种数据模式：

- `src/workflow.json`：流程定义和实例最新快照，字段结构保持不变。
- `src/transition-history.json`：流转事件历史，按 `sequence` 回放；可重复记录同一节点或同一条边，用于驳回、循环和重试。

如果暂时没有流转历史，页面会自动回退为按 `instance.edgeStates` 展示，不影响现有接口接入。后端字段说明和 Java DTO 见 `docs/workflow-api-contract-java.md`。

## 本地运行

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
```

项目使用 React 15.6.2，流程布局由 Dagre 自动计算。
