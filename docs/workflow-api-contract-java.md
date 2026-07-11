# 流程图接口契约（Java 后端）

本文档描述流程图页面需要的接口返回结构。后端必须保持 `definition` 和 `instance` 的字段结构不变。

## 1. 推荐接口

```http
GET /api/workflows/{businessId}
Content-Type: application/json
```

接口直接返回：

```json
{
  "definition": {},
  "instance": {}
}
```

如果项目已有统一响应包装，可放在 `data` 中：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "definition": {},
    "instance": {}
  }
}
```

## 2. Maven 依赖

```xml
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <optional>true</optional>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

## 3. Java DTO

下面代码可以保存为 `WorkflowResponseDTO.java`。只需要将 `package` 修改为项目实际包名。

```java
package com.example.workflow.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 流程图接口返回对象。
 * definition 表示流程的静态定义；instance 表示某一业务实例的运行快照。
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class WorkflowResponseDTO {

    /** 流程定义，必传。 */
    @Valid
    @NotNull
    private WorkflowDefinitionDTO definition;

    /** 流程实例，必传。 */
    @Valid
    @NotNull
    private WorkflowInstanceDTO instance;

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowDefinitionDTO {

        /** 流程编码，全局唯一，必传。 */
        @NotBlank
        private String processCode;

        /** 流程显示名称，必传。 */
        @NotBlank
        private String processName;

        /** 流程定义版本，必传。 */
        @NotNull
        private Integer version;

        /**
         * 流程的全部节点，必传。
         * 没有节点时返回 []，不能返回 null。
         */
        @Valid
        @NotNull
        private List<WorkflowNodeDTO> nodes = new ArrayList<>();

        /**
         * 流程定义中的全部可能连线，必传。
         * 没有连线时返回 []，不能返回 null。
         */
        @Valid
        @NotNull
        private List<WorkflowEdgeDTO> edges = new ArrayList<>();

        /**
         * 子流程分组，必传。
         * 没有分组时返回 []，不能返回 null。
         */
        @Valid
        @NotNull
        private List<WorkflowGroupDTO> groups = new ArrayList<>();
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowNodeDTO {

        /** 节点唯一 ID，必传，同一流程内不能重复。 */
        @NotBlank
        private String id;

        /** 节点显示名称，必传。 */
        @NotBlank
        private String name;

        /**
         * 所属分组 ID，非必传。
         * 主流程节点不返回；分组内节点必须返回。
         */
        private String groupId;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowEdgeDTO {

        /** 连线唯一 ID，必传，同一流程内不能重复。 */
        @NotBlank
        private String id;

        /** 起始节点 ID，必传，必须存在于 definition.nodes。 */
        @NotBlank
        private String source;

        /** 目标节点 ID，必传，必须存在于 definition.nodes。 */
        @NotBlank
        private String target;

        /** 触发事件编码，必传，例如 PASS。 */
        @NotBlank
        private String event;

        /**
         * 分支条件编码，非必传。
         * 只有条件分支连线需要返回，例如 tailFirst。
         */
        private String condition;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowGroupDTO {

        /** 分组唯一 ID，必传，同一流程内不能重复。 */
        @NotBlank
        private String id;

        /** 分组显示名称，必传。 */
        @NotBlank
        private String name;

        /** 分组显示顺序，必传，建议从 1 开始且不能重复。 */
        @NotNull
        private Integer order;

        /** 分组入口节点 ID，必传。 */
        @NotBlank
        private String entryNodeId;

        /** 分组出口节点 ID，必传。 */
        @NotBlank
        private String exitNodeId;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowInstanceDTO {

        /** 流程实例 ID，全局唯一，必传。 */
        @NotBlank
        private String instanceId;

        /** 对应的业务单号，必传。 */
        @NotBlank
        private String businessId;

        /** 流程编码，必传，必须等于 definition.processCode。 */
        @NotBlank
        private String processCode;

        /** 使用的流程定义版本，必传，必须等于 definition.version。 */
        @NotNull
        private Integer definitionVersion;

        /** 流程实例状态，必传。 */
        @NotNull
        private WorkflowInstanceStatus status;

        /**
         * 当前正在处理的节点 ID，必传。
         * 支持并行节点；没有活动节点时返回 []，不能返回 null。
         */
        @NotNull
        private List<String> activeNodeIds = new ArrayList<>();

        /**
         * 已经进入过的节点状态，必传。
         * 尚未进入的节点不要放入该数组。
         */
        @Valid
        @NotNull
        private List<WorkflowNodeStateDTO> nodeStates = new ArrayList<>();

        /**
         * 已实际执行的连线，必传。
         * edgeId 出现在该数组中即表示该连线已经执行。
         */
        @Valid
        @NotNull
        private List<WorkflowEdgeStateDTO> edgeStates = new ArrayList<>();

        /**
         * 实例修订版本，必传。
         * 实例状态变化时单调递增，可用于缓存和并发控制。
         */
        @NotNull
        private Long revision;

        /** 最后更新时间，必传，13 位毫秒时间戳。 */
        @NotNull
        private Long updatedAt;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowNodeStateDTO {

        /** 节点 ID，必传，必须存在于 definition.nodes。 */
        @NotBlank
        private String nodeId;

        /** 节点状态，必传。 */
        @NotNull
        private WorkflowNodeStatus status;

        /** 进入该节点的时间，必传，13 位毫秒时间戳。 */
        @NotNull
        private Long enteredAt;
    }

    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class WorkflowEdgeStateDTO {

        /**
         * 已执行的连线 ID，必传，必须存在于 definition.edges。
         * 当前数据结构没有 status 字段，出现即表示已执行。
         */
        @NotBlank
        private String edgeId;
    }

    public enum WorkflowInstanceStatus {
        /** 流程运行中。 */
        RUNNING,

        /** 流程正常完成。 */
        COMPLETED,

        /** 流程已取消。 */
        CANCELLED,

        /** 流程被终止。 */
        TERMINATED
    }

    public enum WorkflowNodeStatus {
        /** 当前正在处理该节点。 */
        PROCESSING,

        /** 节点已经处理完成。 */
        COMPLETED
    }
}
```

> 如果项目仍使用 Spring Boot 2，将 `jakarta.validation.*` 改成 `javax.validation.*`。

## 4. Controller 示例

```java
package com.example.workflow.controller;

import com.example.workflow.dto.WorkflowResponseDTO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowQueryService workflowQueryService;

    @GetMapping("/{businessId}")
    public @Valid WorkflowResponseDTO getWorkflow(
            @PathVariable String businessId) {
        return workflowQueryService.getWorkflow(businessId);
    }
}
```

## 5. 字段必传规则

| 对象 | 字段 | 必传 | 说明 |
|---|---|---:|---|
| 顶层 | `definition` | 是 | 流程静态定义 |
| 顶层 | `instance` | 是 | 当前业务实例快照 |
| definition | `processCode` | 是 | 流程唯一编码 |
| definition | `processName` | 是 | 页面显示名称 |
| definition | `version` | 是 | 定义版本 |
| definition | `nodes` | 是 | 无数据返回 `[]` |
| definition | `edges` | 是 | 无数据返回 `[]` |
| definition | `groups` | 是 | 无分组返回 `[]` |
| node | `id` | 是 | 节点唯一 ID |
| node | `name` | 是 | 节点显示名称 |
| node | `groupId` | 否 | 只有分组内节点需要 |
| edge | `id` | 是 | 连线唯一 ID |
| edge | `source` | 是 | 起始节点 ID |
| edge | `target` | 是 | 目标节点 ID |
| edge | `event` | 是 | 触发事件编码 |
| edge | `condition` | 否 | 只有条件分支需要 |
| group | 全部字段 | 是 | 分组存在时全部必传 |
| instance | 全部字段 | 是 | 数组无数据返回 `[]` |
| nodeState | 全部字段 | 是 | 节点进入后才放入数组 |
| edgeState | `edgeId` | 是 | 连线执行后才放入数组 |

## 6. 后端必须校验的关联规则

1. `definition.nodes[].id` 不能重复。
2. `definition.edges[].id` 不能重复。
3. `definition.groups[].id` 不能重复。
4. `edge.source` 和 `edge.target` 必须能在 `definition.nodes` 中找到。
5. `node.groupId` 必须能在 `definition.groups` 中找到。
6. `group.entryNodeId` 和 `group.exitNodeId` 必须属于当前分组。
7. `instance.processCode` 必须等于 `definition.processCode`。
8. `instance.definitionVersion` 必须等于 `definition.version`。
9. `activeNodeIds` 和 `nodeStates.nodeId` 必须能在 `definition.nodes` 中找到。
10. `edgeStates.edgeId` 必须能在 `definition.edges` 中找到。
11. 所有列表字段必须返回数组，不能返回 `null`。
12. `enteredAt` 和 `updatedAt` 必须使用 13 位毫秒时间戳，不能使用 10 位秒时间戳。
13. 当 `instance.status` 为 `RUNNING` 时，`activeNodeIds` 至少应有一个节点。
14. `activeNodeIds` 对应的 `nodeStates.status` 应为 `PROCESSING`。
15. `instance.updatedAt` 不应早于任意 `nodeStates.enteredAt`。

## 7. 前端状态解释

- 节点存在于 `nodeStates` 且状态为 `COMPLETED`：已完成节点。
- 节点存在于 `nodeStates` 且状态为 `PROCESSING`：当前处理节点。
- 节点不存在于 `nodeStates`：尚未进入或未选择的候选分支。
- 连线存在于 `edgeStates`：该连线已实际执行。
- 连线不存在于 `edgeStates`：只表示未记录执行，无法区分“已跳过”和“尚未到达”。

## 8. 当前结构的能力边界

当前 `instance` 是流程状态快照，不是完整事件日志：

- `edgeStates` 只有 `edgeId`，无法表达同一条边执行多次、执行时间或执行顺序。
- `nodeStates` 每个节点只有一条状态，无法表达同一节点重复进入。
- 如果业务支持循环、重试、驳回重走，需要另行增加流转历史接口；不要改变本接口现有字段含义。

## 9. 驳回、循环和重试扩展方案

原来的 `definition / instance` 接口继续作为“当前状态快照”，字段结构不变。

流程定义可以直接通过新增边表达驳回和重试，不需要新增字段：

```json
{
  "id": "APPROVAL_PENDING_REJECT_TO_NOT_SUBMITTED",
  "source": "APPROVAL_PENDING",
  "target": "NOT_SUBMITTED",
  "event": "REJECT"
}
```

```json
{
  "id": "PAYMENT_FAILED_RETRY_TO_PAYMENT_PENDING",
  "source": "PAYMENT_FAILED",
  "target": "PAYMENT_PENDING",
  "event": "RETRY"
}
```

由于现有 `edgeStates` 无法表达同一条边执行多次，需要增加独立的流转历史接口：

```http
GET /api/workflows/{instanceId}/transitions
```

```json
{
  "instanceId": "PROCESS_DZDC202606270009",
  "transitions": [
    {
      "transitionId": "TRANSITION_000001",
      "sequence": 1,
      "edgeId": "START_TO_NOT_SUBMITTED",
      "event": "PASS",
      "fromNodeId": "START",
      "toNodeId": "NOT_SUBMITTED",
      "occurredAt": 1782552651000,
      "attempt": 1,
      "operatorId": null,
      "reason": null
    },
    {
      "transitionId": "TRANSITION_000008",
      "sequence": 8,
      "edgeId": "APPROVAL_PENDING_REJECT_TO_NOT_SUBMITTED",
      "event": "REJECT",
      "fromNodeId": "APPROVAL_PENDING",
      "toNodeId": "NOT_SUBMITTED",
      "occurredAt": 1782552658000,
      "attempt": 2,
      "operatorId": "10086",
      "reason": "审批资料不完整"
    }
  ]
}
```

Java DTO：

```java
package com.example.workflow.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class WorkflowTransitionHistoryDTO {

    @NotBlank
    private String instanceId;

    @Valid
    @NotNull
    private List<TransitionDTO> transitions = new ArrayList<>();

    @Data
    public static class TransitionDTO {

        /** 本次流转记录唯一 ID。 */
        @NotBlank
        private String transitionId;

        /** 实例内严格递增的流转序号，前端按该字段播放动画。 */
        @NotNull
        private Long sequence;

        /** 对应 definition.edges.id。 */
        @NotBlank
        private String edgeId;

        /** PASS、REJECT、RETRY、ROLLBACK、CANCEL 等事件编码。 */
        @NotBlank
        private String event;

        @NotBlank
        private String fromNodeId;

        @NotBlank
        private String toNodeId;

        /** 13 位毫秒时间戳。 */
        @NotNull
        private Long occurredAt;

        /** 当前节点或业务动作的第几次尝试，从 1 开始。 */
        @NotNull
        private Integer attempt;

        /** 操作人 ID，系统自动流转时可以为空。 */
        private String operatorId;

        /** 驳回、回退或重试原因，正常 PASS 时可以为空。 */
        private String reason;
    }
}
```

规则：

1. `transitions` 是只追加的事件日志，历史记录不能覆盖或删除。
2. `sequence` 在同一个实例内必须唯一并严格递增。
3. 同一个 `edgeId` 可以出现多次，用于表达循环或重试。
4. `instance.nodeStates` 仍返回每个节点的最新状态。
5. `instance.edgeStates` 仍表示该边是否曾经执行过。
6. 前端回放动画优先按 `transitions.sequence`，不能再根据 `edgeStates` 猜测执行顺序。

流转历史字段必传规则：

| 字段 | 必传 | 说明 |
|---|---:|---|
| `instanceId` | 是 | 对应实例 ID |
| `transitions` | 是 | 无历史时返回 `[]`，不能返回 `null` |
| `transitionId` | 是 | 单次流转记录唯一 ID |
| `sequence` | 是 | 实例内严格递增且唯一 |
| `edgeId` | 是 | 必须对应 `definition.edges[].id` |
| `event` | 是 | `PASS`、`REJECT`、`RETRY`、`ROLLBACK` 或业务扩展值 |
| `fromNodeId` | 是 | 必须对应边的 `source` |
| `toNodeId` | 是 | 必须对应边的 `target` |
| `occurredAt` | 是 | 13 位毫秒时间戳 |
| `attempt` | 是 | 第几次进入或尝试，从 1 开始 |
| `operatorId` | 否 | 系统自动流转可以为空 |
| `reason` | 否 | 驳回、回退、重试时建议返回 |
