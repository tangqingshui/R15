# 流程观测台（React 15）

基于 `process-data-simplified.json` 的流程图页面，展示流程定义、子流程分组、已执行路径和当前节点。

页面只需要一个接口，响应中同时返回：

- `definition`：流程节点、连线、分组和条件定义。
- `instance`：当前实例快照；可选的 `instance.transitions` 用于表达驳回、重试、回退、循环和并行流转历史。

当前 `src/workflow.json` 已内置一份复杂实例数据。后端不返回 `instance.transitions`、返回 `null` 或返回 `[]` 时，前端会自动回退为按 `instance.edgeStates` 静态展示。后端字段说明和 Java DTO 见 `docs/workflow-api-contract-java.md`。

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
