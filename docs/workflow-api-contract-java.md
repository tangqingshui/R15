# 流程图单接口契约（Java 后端）

本文档用于对接当前流程图页面。后端只需要提供一个接口，同时返回流程定义 `definition` 和流程实例 `instance`。

## 1. 接口

```http
GET /api/workflows/{businessId}
Content-Type: application/json
```

```json
{
  "definition": {
    "processCode": "DZDC_SOE_FOREIGN_PAY_FIRST_BUSINESS_FLOW",
    "processName": "垫资代采-国企模式-外贸-主流程",
    "version": 1,
    "nodes": [],
    "edges": [],
    "groups": []
  },
  "instance": {
    "instanceId": "PROCESS_DZDC202606270009",
    "businessId": "BUSINESS_10001",
    "processCode": "DZDC_SOE_FOREIGN_PAY_FIRST_BUSINESS_FLOW",
    "definitionVersion": 1,
    "status": "RUNNING",
    "activeNodeIds": ["REPAYMENT_PENDING"],
    "nodeStates": [],
    "edgeStates": [],
    "transitions": [],
    "revision": 19,
    "updatedAt": 1782552676000
  }
}
```

如果项目有统一响应包装，可以将上述对象放到 `data` 中。

## 2. 必传规则

| 对象 | 字段 | 必传 | 说明 |
|---|---|---:|---|
| 顶层 | `definition` | 是 | 流程静态定义 |
| 顶层 | `instance` | 是 | 当前业务实例 |
| definition | `processCode` | 是 | 流程唯一编码 |
| definition | `processName` | 是 | 页面显示名称 |
| definition | `version` | 是 | 流程定义版本 |
| definition | `nodes` | 是 | 无节点返回 `[]` |
| definition | `edges` | 是 | 无连线返回 `[]` |
| definition | `groups` | 是 | 无分组返回 `[]` |
| node | `id`、`name` | 是 | 节点唯一 ID 和名称 |
| node | `groupId` | 否 | 只有分组内节点需要 |
| edge | `id`、`source`、`target`、`event` | 是 | 连线定义 |
| edge | `condition` | 否 | 条件分支编码 |
| group | `id`、`name`、`order`、`entryNodeId`、`exitNodeId` | 是 | 分组定义 |
| instance | 除 `transitions` 外的字段 | 是 | 必传数组无数据返回 `[]` |
| instance | `transitions` | 否 | 可缺失、为 `null` 或为 `[]` |

前端对 `transitions` 的兼容规则：

- 有记录：按 `sequence` 展示驳回、重试、回退、循环、并行和重复进入次数。
- 字段缺失、`null` 或 `[]`：自动使用 `edgeStates` 和 `nodeStates` 静态展示。

## 3. 事件类型

| event | 含义 | 推荐颜色 |
|---|---|---|
| `PASS` | 正常流转；并行拆分和汇合也使用 PASS | 绿色 |
| `REJECT` | 业务驳回 | 红色 |
| `RETRY` | 重新发起或重试 | 紫色 |
| `ROLLBACK` | 回退到历史节点 | 红色 |
| `CANCEL` | 取消 | 按业务扩展 |

驳回、重试和回退必须先在 `definition.edges` 中定义对应的边，再由 `instance.transitions[].edgeId` 引用。

## 4. 复杂流转示例

```json
{
  "transitions": [
    {
      "transitionId": "T001",
      "sequence": 1,
      "edgeId": "NOT_SUBMITTED_TO_APPROVAL_PENDING",
      "event": "PASS",
      "fromNodeId": "NOT_SUBMITTED",
      "toNodeId": "APPROVAL_PENDING",
      "occurredAt": 1782552652000
    },
    {
      "transitionId": "T002",
      "sequence": 2,
      "edgeId": "APPROVAL_PENDING_REJECT_TO_NOT_SUBMITTED",
      "event": "REJECT",
      "fromNodeId": "APPROVAL_PENDING",
      "toNodeId": "NOT_SUBMITTED",
      "occurredAt": 1782552653000,
      "reason": "审批资料不完整"
    },
    {
      "transitionId": "T003",
      "sequence": 3,
      "edgeId": "NOT_SUBMITTED_RETRY_TO_APPROVAL_PENDING",
      "event": "RETRY",
      "fromNodeId": "NOT_SUBMITTED",
      "toNodeId": "APPROVAL_PENDING",
      "occurredAt": 1782552654000,
      "reason": "资料补齐后重新发起"
    },
    {
      "transitionId": "T004",
      "sequence": 4,
      "edgeId": "ENTRY_TO_PARALLEL_A",
      "event": "PASS",
      "fromNodeId": "GROUP_ENTRY",
      "toNodeId": "PARALLEL_A",
      "occurredAt": 1782552655000
    },
    {
      "transitionId": "T005",
      "sequence": 5,
      "edgeId": "ENTRY_TO_PARALLEL_B",
      "event": "PASS",
      "fromNodeId": "GROUP_ENTRY",
      "toNodeId": "PARALLEL_B",
      "occurredAt": 1782552655100
    },
    {
      "transitionId": "T006",
      "sequence": 6,
      "edgeId": "CI_ROLLBACK_TO_SETTLEMENT_DONE",
      "event": "ROLLBACK",
      "fromNodeId": "TAIL_CI_PENDING",
      "toNodeId": "SETTLEMENT_DONE",
      "occurredAt": 1782552656000,
      "reason": "CI 金额与结算结果不一致"
    }
  ]
}
```

并行流程不需要新增字段：同一个起点连续产生多条 `PASS` 记录即可。并行汇合时，不同分支分别流向同一个汇合节点。

## 5. Java DTO

下面代码可以保存为 `WorkflowResponseDTO.java`。Spring Boot 2 项目将 `jakarta.validation.*` 改为 `javax.validation.*`。

```java
package com.example.workflow.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class WorkflowResponseDTO {

    @Valid
    @NotNull
    private WorkflowDefinitionDTO definition;

    @Valid
    @NotNull
    private WorkflowInstanceDTO instance;

    @Data
    public static class WorkflowDefinitionDTO {
        @NotBlank private String processCode;
        @NotBlank private String processName;
        @NotNull private Integer version;
        @Valid @NotNull private List<WorkflowNodeDTO> nodes = new ArrayList<>();
        @Valid @NotNull private List<WorkflowEdgeDTO> edges = new ArrayList<>();
        @Valid @NotNull private List<WorkflowGroupDTO> groups = new ArrayList<>();
    }

    @Data
    public static class WorkflowNodeDTO {
        @NotBlank private String id;
        @NotBlank private String name;
        private String groupId;
    }

    @Data
    public static class WorkflowEdgeDTO {
        @NotBlank private String id;
        @NotBlank private String source;
        @NotBlank private String target;
        @NotNull private TransitionEvent event;
        private String condition;
    }

    @Data
    public static class WorkflowGroupDTO {
        @NotBlank private String id;
        @NotBlank private String name;
        @NotNull private Integer order;
        @NotBlank private String entryNodeId;
        @NotBlank private String exitNodeId;
    }

    @Data
    public static class WorkflowInstanceDTO {
        @NotBlank private String instanceId;
        @NotBlank private String businessId;
        @NotBlank private String processCode;
        @NotNull private Integer definitionVersion;
        @NotNull private WorkflowInstanceStatus status;
        @NotNull private List<String> activeNodeIds = new ArrayList<>();
        @Valid @NotNull private List<WorkflowNodeStateDTO> nodeStates = new ArrayList<>();
        @Valid @NotNull private List<WorkflowEdgeStateDTO> edgeStates = new ArrayList<>();

        /**
         * 可选。不要添加 @NotNull。
         * 不支持历史流转时可以完全不返回该字段。
         */
        @Valid
        private List<WorkflowTransitionDTO> transitions;

        @NotNull private Long revision;
        @NotNull private Long updatedAt;
    }

    @Data
    public static class WorkflowNodeStateDTO {
        @NotBlank private String nodeId;
        @NotNull private WorkflowNodeStatus status;
        @NotNull private Long enteredAt;
    }

    @Data
    public static class WorkflowEdgeStateDTO {
        @NotBlank private String edgeId;
    }

    @Data
    public static class WorkflowTransitionDTO {
        @NotBlank private String transitionId;
        @NotNull private Long sequence;
        @NotBlank private String edgeId;
        @NotNull private TransitionEvent event;
        @NotBlank private String fromNodeId;
        @NotBlank private String toNodeId;
        @NotNull private Long occurredAt;
        private Integer attempt;
        private String operatorId;
        private String reason;
    }

    public enum WorkflowInstanceStatus {
        RUNNING, COMPLETED, CANCELLED, TERMINATED
    }

    public enum WorkflowNodeStatus {
        PROCESSING, COMPLETED
    }

    public enum TransitionEvent {
        PASS, REJECT, RETRY, ROLLBACK, CANCEL
    }
}
```

## 6. Controller

```java
@RestController
@RequestMapping("/api/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowQueryService workflowQueryService;

    @GetMapping("/{businessId}")
    public WorkflowResponseDTO getWorkflow(@PathVariable String businessId) {
        return workflowQueryService.getWorkflow(businessId);
    }
}
```

## 7. 后端校验规则

1. 节点 ID、边 ID、分组 ID 在同一个定义内必须唯一。
2. `edge.source` 和 `edge.target` 必须存在于 `definition.nodes`。
3. `group.entryNodeId` 和 `group.exitNodeId` 必须属于对应分组。
4. `instance.processCode`、`definitionVersion` 必须与流程定义一致。
5. `activeNodeIds`、`nodeStates.nodeId` 必须引用已定义节点。
6. `edgeStates.edgeId` 必须引用已定义边。
7. 必传列表必须返回数组，不能返回 `null`。
8. 时间统一使用 13 位毫秒时间戳。
9. `RUNNING` 实例至少应有一个活动节点，对应节点状态应为 `PROCESSING`。
10. 返回 `transitions` 时，`sequence` 必须在实例内唯一并严格递增。
11. `transitions.edgeId` 必须引用已定义边，起止节点必须与该边一致。
12. 同一条边可以出现多次，历史记录只能追加，不能覆盖旧记录。

## 8. 前端展示规则

- `nodeStates.status = COMPLETED`：已完成节点。
- `nodeStates.status = PROCESSING`：当前节点。
- 节点不在 `nodeStates`：未进入的候选节点。
- `edgeStates`：没有历史日志时用于判断哪些边曾执行。
- `transitions`：存在时优先用于动画、事件颜色、进入次数、最近动作和原因展示。
- `activeNodeIds` 使用数组，因此天然支持多个并行活动节点。
