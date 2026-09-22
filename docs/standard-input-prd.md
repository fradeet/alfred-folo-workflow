# PRD：App 标准输入

## 1. 文档信息

- 状态：草案
- 目标版本：待定
- 适用范围：由 Alfred 直接调用的 `src/app` 可执行入口
- 不适用范围：Folo block、Alfred 节点间 contract、内部后台 worker

### 1.1 已确认产品决策

1. 标准 JSON 保留 `version` 字段；目标 app 由被执行的入口确定，JSON 不要求携带 `app`。
2. `timeline`、`subscriptions` 和 `unread` 的 query 保持现状，本需求不新增 app 内过滤。
3. `login` 纳入标准输入，但不改变其对 macOS、Alfred 和 `osascript` 的依赖。
4. 标准输入保留全局配置 fallback，优先级低于 argv 和 app 驼峰标准变量。

## 2. 背景

当前 `src/app` 中的可执行入口主要服务于 Alfred 工作流：

- Alfred 节点间通过 argv 传递完整的序列化 class contract；
- workflow 配置和辅助运行状态通过环境变量传递；
- 部分入口还接受普通字符串等兼容输入。

这套方式适合工作流内部编排，但外部程序如果希望直接调用某个 app，需要了解
Alfred 节点结构、上游 contract 或既有的零散环境变量。为降低外部调用成本，每个由
Alfred 直接调用的 app 应提供一套统一、稳定、可验证的“标准输入”能力。

标准输入是对外接口，不取代也不改变工作流内部已有的输入 contract。环境变量名称由
各 app 在代码中明确写死，不根据文件名、类名或属性名动态生成。只有被识别为标准输入
的调用才会合并 argv 与标准环境变量。

## 3. 产品目标

### 3.1 目标

1. 外部调用者无需构造 Alfred 上游 selection contract，也能直接调用公开 app。
2. 每个 app 使用一个 class 表示完成自身逻辑所需的全部标准输入参数。
3. 标准输入既可以来自 argv，也可以来自 app 专属环境变量。
4. argv 与环境变量可以共同组成一个完整输入；同一字段在两处均有声明时，argv 优先。
5. 所有外部输入在 app 边界完成解析、类型转换、合并和验证。
6. 保持现有 Alfred 工作流行为、节点间 contract、输出格式和错误处理兼容。
7. 将环境变量名称、字段类型、默认值和错误语义沉淀为稳定的公开接口。
8. 将标准输入建设为仓库级通用能力；未来新增的 Alfred 可执行入口默认必须接入，而不是
   为每个入口重复设计一套解析规则。

### 3.2 非目标

1. 不使用 Unix stdin 读取输入；“标准输入”是本项目的 app 输入协议名称。
2. 不将现有 Alfred 节点间 contract 改造成标准输入。
3. 不允许环境变量覆盖非标准输入中的 selection、entry ID、feed ID 等业务字段。
4. 不根据文件名或属性名自动生成环境变量名称。
5. 不改变 Folo CLI 的参数或 JSON envelope。
6. 不改变现有 app 输出 contract。
7. 不要求内部后台 worker 支持标准输入。
8. 本需求不新增查询过滤、缓存生成或登录能力，仅标准化现有 app 已具备能力的输入方式。

## 4. 术语

### 4.1 标准输入

面向外部调用者的 app 输入。标准输入由一个 app 专属 class 表示，可以由标准 JSON
argv、标准环境变量或两者共同构造。

### 4.2 非标准输入

现有的 Alfred 节点间 contract、普通查询字符串、Folo share URL、view input，以及其他
已有兼容输入。非标准输入继续走原有解析路径，不参与标准环境变量合并。

### 4.3 app ID

标准输入协议中用于识别目标 app 的稳定标识。app ID 在代码中明确声明，不在运行时从
文件路径推导。首版 app ID 与当前文件名保持一致：

- `timeline`
- `subscriptions`
- `unread`
- `mark-read`
- `mark-read-above`
- `login`

未来新增入口必须声明新的稳定 app ID。app ID 一旦作为标准输入接口发布，不得仅因文件
重命名而变化。

## 5. 用户场景

### 5.1 仅使用 argv

外部调用者通过一个 JSON 参数传递完整标准输入：

```bash
node workflow/dist/app/mark-read.js \
  '{"kind":"standard","version":1,"entryId":"entry-1"}'
```

### 5.2 仅使用环境变量

外部调用者通过标准标记和 app 专属环境变量构造输入：

```bash
frrMarkReadKind=standard \
frrMarkReadEntryId=entry-1 \
node workflow/dist/app/mark-read.js
```

也可以使用 `IS_STANDARD_INPUT` 标记：

```bash
frrMarkReadIsStandardInput=1 \
frrMarkReadEntryId=entry-1 \
node workflow/dist/app/mark-read.js
```

### 5.3 argv 与环境变量组合

外部调用者可以用环境变量提供默认参数，再由 argv 覆盖部分字段：

```bash
frrTimelineLimit=50 \
frrTimelineView=articles \
node workflow/dist/app/timeline.js \
  '{"kind":"standard","version":1,"limit":20,"unreadOnly":false}'
```

最终输入的 `limit` 为 `20`、`view` 为 `articles`、`unreadOnly` 为 `false`。

### 5.4 保持 Alfred 内部输入不变

当 `mark-read` 收到 `TimelineSelection` 时，它必须继续按现有 contract 完整解析。即使
进程环境中存在 `frrMarkReadEntryId`，也不得用该变量覆盖 selection 中的
`entryId`。

## 6. 标准输入协议

### 6.1 JSON 结构

标准 argv 是一个 JSON object，并作为一个完整命令行参数传入：

```json
{
  "kind": "standard",
  "version": 1,
  "view": "articles",
  "limit": 30
}
```

协议公共字段如下：

| 字段 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `kind` | `"standard"` | 条件必需 | 与 `isStandardInput` 二选一，用于识别标准输入 |
| `isStandardInput` | `1` | 条件必需 | 与 `kind` 二选一，用于识别标准输入 |
| `version` | positive integer | 否 | 缺省为 `1`；不支持的版本必须报错 |

业务字段位于同一个 JSON object 顶层，避免为了少量标量参数增加无必要的 envelope 层级。
目标 app 由调用者选择的可执行入口确定，因此标准 JSON 不重复声明 `app`。稳定 app ID 仍用于
环境变量命名、入口配置、文档登记和后续兼容管理。

### 6.2 标准输入判定

argv JSON 满足以下任一条件时，被识别为标准输入：

- `kind === "standard"`；
- `isStandardInput === 1`。

仅使用环境变量时，满足以下任一条件即可进入标准输入模式：

- app 专属 `frr<AppId>Kind` 环境变量严格等于 `standard`；
- app 专属 `frr<AppId>IsStandardInput` 环境变量严格等于 `1`。

判定顺序必须满足：

1. 非空 argv 如果能识别为现有非标准 contract，则按原路径解析，并忽略全部标准环境变量；
2. 非空 argv 带有标准标记时，进入标准输入模式；
3. argv 为空时，才允许由环境中的标准标记单独开启标准输入模式；
4. 其余情况保持 app 原有输入行为。

如果 argv 同时表现为已知非标准 contract 和标准输入，必须报告输入冲突，不得猜测调用者意图。

### 6.3 合并优先级

进入标准输入模式后，每个业务字段按以下优先级取值：

1. argv JSON 中明确存在的字段；
2. 对应 app 专属的首字母小写驼峰环境变量；
3. 该字段明确声明的全局配置；
4. app 输入类定义的默认值；
5. 若字段必需且仍无值，报告缺少参数。

第 3 级只适用于明确关联了全局配置的字段；不得把所有全局环境变量自动并入标准输入。

合并必须依据字段是否存在，而不是值是否 truthy。argv 中的以下值均视为显式输入：

- `false`
- `0`
- `""`
- `null`

这些值是否有效由具体输入类决定，但不能在合并阶段被低优先级值替换。

低优先级值被 argv 覆盖时，不需要解析或验证。例如 argv 已提供合法 `limit` 时，环境中
被覆盖的无效 `frrTimelineLimit` 不应导致调用失败。

### 6.4 解析与验证

1. argv 和环境变量均视为不可信输入。
2. 环境变量只能通过 app 明确声明的映射读取。
3. 数字、布尔值和 nullable 值必须使用字段专属规则转换，不能依赖 JavaScript 隐式转换。
4. 合并完成后，只构造一次 app 标准输入 class，由该 class 完成最终验证和规范化。
5. 版本不支持、必需字段缺失或字段值非法时，入口按当前 app 类型输出错误：
   - Script Filter 输出 Alfred error item，并设置非零退出码；
   - action script 写入 stderr，并设置非零退出码。
6. 版本 1 中出现未知 JSON 字段时应报错，以便及时发现拼写错误。

### 6.5 标记一致性

如果 `kind` 与 `isStandardInput` 同时出现：

- `kind` 必须为 `standard`；
- `isStandardInput` 必须为数字 `1`；
- 任一字段出现不兼容值时必须报错。

JSON 中的 `isStandardInput` 使用数字 `1`。环境变量中的对应值使用字符串 `1`。

## 7. Alfred 变量与环境变量规范

### 7.1 项目变量分层

由于 app 实际运行在 Alfred 工作流环境中，项目通过变量的大小写形式区分作用域和来源。
项目自有变量必须遵守以下约定：

| 形式 | 示例 | 含义 | 稳定性 |
| --- | --- | --- | --- |
| 全大写 + 下划线 | `FRR_TIMELINE_LIMIT` | 全局环境变量或用户可配置的 workflow 配置 | 稳定；可被多个节点或 app 使用 |
| 首字母小写驼峰 | `frrTimelineUnreadOnly` | 由 Alfred 节点或工作流产生，并通过环境变量传给脚本的变量 | 稳定；可作为节点与 app 的接口 |
| 全小写 + 下划线 | `result_cache_key` | 工作流内部的中间临时变量，通常用于流程末尾的短暂传递 | 非公开；不保证跨版本稳定 |

标准输入字段属于第二类：它们由 Alfred 工作流或外部调用者为某个 app 设置，并通过环境
变量进入脚本，因此统一使用首字母小写的驼峰命名。

全大写变量不得用于表示某次调用的标准输入字段；它们只用于 workflow 全局配置或跨 app
共享配置。全小写下划线变量不得成为标准输入公开接口。

Alfred 自身提供的保留变量不受项目命名规则约束，例如
`alfred_workflow_bundleid` 和 `alfred_workflow_cache`。代码应保留 Alfred 定义的原始名称。

### 7.2 标准输入变量命名

标准输入变量使用以下可读结构：

```text
<prefix><AppId><Field>
```

首版使用小写前缀 `frr`，app ID 和字段转成 UpperCamelCase 后依次连接。例如：

```text
frrMarkReadEntryId
frrMarkReadAboveResultCacheKey
```

该格式仅用于保持命名一致；每个变量名仍须在相应 app 的代码中逐项明确声明。实现不得根据
文件名、app ID 或字段名动态拼接环境变量名称。

### 7.3 公共标记变量

每个 app 明确声明自己的两个标准输入标记：

```text
frr<AppId>Kind
frr<AppId>IsStandardInput
```

两者均可开启环境变量标准输入模式，不要求同时提供。

例如 `timeline` 使用：

```text
frrTimelineKind
frrTimelineIsStandardInput
```

### 7.4 全局变量、标准变量与默认值

同一个业务概念可以同时存在全局配置和某次调用的标准输入，但必须使用不同名称并明确
优先级。例如 timeline limit：

- `FRR_TIMELINE_LIMIT`：用户设置的全局 workflow 配置；
- `frrTimelineLimit`：某次 timeline 标准调用的输入。

标准输入模式下，其优先级为：

1. argv JSON 字段；
2. 首字母小写驼峰的 app 标准输入变量；
3. 全大写下划线的全局配置；
4. app 输入类默认值。

非标准输入保持当前全局配置行为，并忽略仅供标准输入使用的驼峰业务变量。现有 Alfred
内部调用已经使用的驼峰变量仍按原有语义处理。

### 7.5 旧环境变量

现有 Alfred 变量继续保持原语义，例如：

- `FRR_TIMELINE_LIMIT`
- `frrTimelineUnreadOnly`
- `frrResultCacheKey`
- `alfred_workflow_bundleid`

如果某个旧变量也被标准输入采用，app 必须明确记录它是标准变量、兼容别名还是仅供 Alfred
内部使用。标准输入不得隐式扫描或继承其他环境变量。

## 8. App 输入定义

下表定义首版公开字段。最终 class 名称可以按项目命名约定调整，但每个 app 必须拥有独立
的标准输入 class。

### 8.1 `timeline`

建议 class：`TimelineStandardInput`

| JSON 字段 | 环境变量 | 类型 | 必需 | 默认值 |
| --- | --- | --- | --- | --- |
| `query` | `frrTimelineQuery` | string | 否 | `""` |
| `view` | `frrTimelineView` | string | 否 | 无 |
| `limit` | `frrTimelineLimit` | positive integer | 否 | `FRR_TIMELINE_LIMIT`，否则 `30` |
| `unreadOnly` | `frrTimelineUnreadOnly` | boolean | 否 | `false` |
| `cursor` | `frrTimelineCursor` | string | 否 | 无 |
| `feed` | `frrTimelineFeed` | string | 否 | 无 |
| `list` | `frrTimelineList` | string | 否 | 无 |
| `category` | `frrTimelineCategory` | string | 否 | 无 |

`frrTimelineUnreadOnly` 已由 Alfred 内部节点使用；它同时是 timeline 标准输入的固定变量名，
但在非标准调用中继续保持当前 Alfred 语义。标准字段的行为应与现有
`TimelineBlockInput` 一致。`query` 当前由 Alfred 负责结果过滤；本需求不新增外部调用的
app 内过滤。

### 8.2 `subscriptions`

建议 class：`SubscriptionsStandardInput`

| JSON 字段 | 环境变量 | 类型 | 必需 | 默认值 |
| --- | --- | --- | --- | --- |
| `query` | `frrSubscriptionsQuery` | string | 否 | `""` |
| `view` | `frrSubscriptionsView` | string | 否 | 无 |
| `category` | `frrSubscriptionsCategory` | string | 否 | 无 |

`view` 和 `category` 对应现有 `SubscriptionsBlockInput` 能力。`query` 当前由 Alfred 负责
结果过滤；本需求不要求外部调用结果新增本地过滤行为，该差异必须在对外文档中说明。

### 8.3 `unread`

建议 class：`UnreadStandardInput`

| JSON 字段 | 环境变量 | 类型 | 必需 | 默认值 |
| --- | --- | --- | --- | --- |
| `query` | `frrUnreadQuery` | string | 否 | `""` |
| `view` | `frrUnreadView` | string | 否 | 无 |

`view` 对应现有 `UnreadBlockInput` 能力。`query` 当前由 Alfred 负责结果过滤；本需求不新增
外部调用的本地过滤。

### 8.4 `mark-read`

建议 class：`MarkReadStandardInput`

| JSON 字段 | 环境变量 | 类型 | 必需 | 默认值 |
| --- | --- | --- | --- | --- |
| `entryId` | `frrMarkReadEntryId` | non-empty string | 是 | 无 |

标准输入只需提供执行该动作所需的 entry ID。Alfred 内部仍传递完整的
`TimelineSelection`，且标准环境变量不得覆盖其中字段。

### 8.5 `mark-read-above`

建议 class：`MarkReadAboveStandardInput`

| JSON 字段 | 环境变量 | 类型 | 必需 | 默认值 |
| --- | --- | --- | --- | --- |
| `entryId` | `frrMarkReadAboveEntryId` | non-empty string | 是 | 无 |
| `resultCacheKey` | `frrMarkReadAboveResultCacheKey` | non-empty string | 是 | 无 |

`resultCacheKey` 必须指向调用环境中可访问的现有 timeline response cache。标准输入只解决
参数传递，不负责创建、传输或恢复该缓存。

Alfred 内部继续从完整 `TimelineSelection` 和 `frrResultCacheKey` 构造执行输入。

### 8.6 `login`

建议 class：`LoginStandardInput`

| JSON 字段 | 环境变量 | 类型 | 必需 | 默认值 |
| --- | --- | --- | --- | --- |
| `workflowBundleId` | `frrLoginWorkflowBundleId` | non-empty string | 是 | 无 |

标准输入中的 workflow bundle ID 用于保存 `FOLO_TOKEN`。Alfred 内部调用继续兼容
`alfred_workflow_bundleid`。标准输入不消除该功能对 macOS、Alfred 和 `osascript` 的依赖。

### 8.7 不纳入首版的入口

`cache-subscription-icons` 是由 app 启动的内部后台 worker，不是 Alfred 直接调用的公开
入口，因此不提供标准输入。

## 9. App 边界与执行模型

每个公开 app 的入口应遵循相同阶段：

```text
argv + process.env
        │
        ▼
识别现有 contract / standard / legacy 输入
        │
        ▼
仅 standard：按硬编码映射读取环境字段并合并
        │
        ▼
构造并验证 app input class
        │
        ▼
app orchestration
        │
        ▼
现有 app output
```

orchestration 函数不应自行读取标准输入环境变量。所有标准输入解析应发生在最外层 app
边界，以便业务逻辑可以直接通过 class 实例测试。

现有上游 contract 可以在 app 边界转换为执行所需的输入，但不得在 `workflow/info.plist`
中拆分并重组业务字段。

### 9.1 通用能力要求

标准输入的识别、字段来源合并和基础类型转换应由共享模块提供。每个 app 只负责声明：

- 稳定 app ID；
- 该 app 的两个标准标记变量名；
- JSON 字段与硬编码环境变量名的映射；
- 字段类型和可选的全局配置 fallback；
- app 专属输入 class 的最终验证；
- 现有非标准输入如何转换为 app 执行输入。

共享模块负责：

- 判断当前调用是否进入标准输入模式；
- 保证非标准输入不读取标准业务环境变量；
- 按 argv、驼峰标准变量、明确关联的全局配置、默认值顺序合并；
- 按字段是否存在而非 truthy 值执行覆盖；
- 提供 string、boolean、integer 等一致的环境值转换规则；
- 检查标准标记、协议版本、未知字段和来源冲突；
- 返回可供 app 输入 class 验证的 `unknown` record。

共享模块不得：

- 动态生成环境变量名；
- 引用具体 app；
- 读取 Folo CLI payload；
- 构造 Alfred 输出；
- 直接执行 app 业务逻辑。

共享模块应放在符合现有依赖方向的位置，使 `app` 可以依赖它，同时不让 `block` 依赖
`app`。具体文件名由实现阶段决定。

### 9.2 新入口默认要求

以后每新增一个由 Alfred 直接调用的 `src/app` 可执行入口，必须同时完成：

1. 声明稳定 app ID；
2. 定义并导出标准输入 class；
3. 明确写出标准标记和业务字段的驼峰环境变量名；
4. 使用共享能力解析和合并 standard argv/environment；
5. 保持 Alfred 内部 contract 与标准外部输入隔离；
6. 在 reference 文档中登记字段和调用示例；
7. 添加 argv-only、environment-only、混合输入和非标准输入隔离测试。

只有不受 Alfred 直接调用的内部 worker，或在需求中明确说明不提供外部调用能力的内部
入口，才可以豁免。豁免原因必须写入代码注释或相关设计文档。

## 10. 向后兼容

1. 所有已有 argv 输入继续有效。
2. Alfred 节点间继续传递完整序列化 contract。
3. 现有 shell adapter 保持工作流内部职责，不因标准输入接口而强制移除。
4. 非标准调用不读取标准业务环境变量。
5. 输出 JSON、Alfred item、stdout/stderr 和退出码规则保持不变。
6. `workflow/info.plist` 不需要改用标准输入。
7. 若标准变量与现有变量重名，必须保持现有合法取值的含义兼容。

标准外部调用是 `AGENTS.md` 中 primary input 通过 argv 传递规则的明确例外。该例外只适用于
被标准标记识别的外部调用，不改变 Alfred 工作流内部规则。实现该功能时应同步把此边界
补充到 `AGENTS.md`。

## 11. 错误处理

以下情况必须产生可操作的错误信息：

- 标准标记值非法或互相冲突；
- 协议版本不受支持；
- 必需字段在合并后仍缺失；
- 环境变量无法转换为声明类型；
- argv JSON 字段类型不正确；
- 出现未知标准输入字段；
- 输入同时匹配已知非标准 contract 和标准输入；
- `mark-read-above` 找不到所声明的缓存。

错误信息不得输出 token 等敏感环境变量的值。

## 12. 可观测性与安全

1. 标准输入模式不得静默回退到普通查询字符串，否则外部调用错误可能被掩盖。
2. 不在正常 stdout 中附加调试信息，以免破坏 JSON 输出 contract。
3. 错误日志可以报告字段名和来源，但不得打印完整环境。
4. argv 可能被系统进程列表观察，文档不得建议通过标准输入传递 token 等秘密。
5. 未显式列入映射的环境变量不得影响标准输入。

## 13. 测试要求

每个公开 app 至少覆盖以下测试：

1. 完整 argv 标准输入解析成功；
2. 仅环境变量的标准输入解析成功；
3. argv 与环境变量组合成功；
4. 同名字段由 argv 覆盖环境变量；
5. `false`、`0`、空字符串和 `null` 不因合并逻辑被错误覆盖；
6. 非标准 contract 完全忽略标准环境变量；
7. 缺少必需字段时失败；
8. 字段类型或环境变量格式非法时失败；
9. 未知字段和不支持版本失败；
10. 现有 Alfred 输入和输出回归测试继续通过。

共享解析工具还应覆盖：

- 两种标准标记分别生效；
- 两种标记一致时生效、冲突时失败；
- 被 argv 覆盖的非法环境变量不会导致失败；
- 没有标准标记时不读取标准业务环境变量。

完成实现后运行：

```bash
pnpm run check
git diff --check
```

## 14. 文档要求

README 或独立 reference 文档需要列出：

- 标准 JSON 格式；
- 每个 app 的 app ID；
- 每个字段的类型、是否必需和默认值；
- 每个硬编码环境变量名；
- argv 优先规则；
- 环境变量-only 和混合调用示例；
- `timeline`、`subscriptions`、`unread` 查询过滤由 Alfred 完成的现状；
- `mark-read-above` 对 workflow cache 的依赖；
- `login` 对 Alfred 和 macOS 的依赖。

## 15. 验收标准

当以下条件全部满足时，本需求可验收：

1. 六个由 Alfred 直接调用的 app 均定义并导出自己的标准输入 class。
2. 每个 app 均支持完整 argv、完整环境变量和二者组合三种标准输入方式。
3. 每个环境变量名均在代码中明确声明，没有动态名称生成逻辑。
4. 标准输入可通过 `kind=standard` 或 `isStandardInput=1` 识别。
5. 同一字段同时存在时 argv 始终优先，并正确保留 falsy 值。
6. 非标准输入不受任何标准业务环境变量影响。
7. Alfred 内部节点间 contract 和 `workflow/info.plist` 路由方式保持不变。
8. app orchestration 接收已验证的 class，不自行读取标准环境变量。
9. 所有新增解析和合并行为有自动化测试。
10. `pnpm run check` 与 `git diff --check` 均通过。
11. 共享解析能力没有具体 app 分支；新增入口可以仅通过声明映射和输入 class 接入。
12. `AGENTS.md` 已把标准输入列为新 Alfred app 入口的默认要求，并记录允许豁免的范围。

## 16. 实施计划

### 16.1 阶段一：确定共享协议

1. 按已确认决策固定标准输入公共字段、版本和冲突处理规则。
2. 确认三类 Alfred 变量命名规范。
3. 确认六个现有 app 的固定环境变量名和字段表。
4. 为共享解析能力编写独立测试，再接入具体 app。

### 16.2 阶段二：实现通用解析能力

1. 新增与具体 app 无关的标准输入识别与合并模块。
2. 使用显式 schema 或字段描述声明硬编码变量映射，不动态生成变量名。
3. 实现字段存在性合并、类型转换、版本检查、未知字段检查和错误信息。
4. 验证共享模块不会在非标准调用中读取标准业务变量。

### 16.3 阶段三：迁移现有入口

按风险从低到高接入现有入口：

1. `subscriptions`、`unread`；
2. `timeline`；
3. `mark-read`；
4. `mark-read-above`；
5. `login`。

每个入口迁移时同步补齐输入 class、环境变量声明、直接执行 guard、测试和外部调用文档。
`cache-subscription-icons` 保持内部 worker 身份，不接入标准输入。

### 16.4 阶段四：修改 `AGENTS.md`

实现标准输入时，必须同步修改仓库根目录 `AGENTS.md`。计划增加以下规则：

1. 在 **App rules** 中规定：所有由 Alfred 直接调用的新增 app 必须定义并导出标准输入
   class，并使用仓库共享解析能力。
2. 明确标准外部输入是 primary input 必须经 argv 传递规则的例外，但该例外仅在
   `kind=standard` 或 `isStandardInput=1` 被确认后生效。
3. 明确非标准 Alfred contract 永远不与标准环境变量合并，现有完整 contract 必须继续
   通过 argv 原样传递。
4. 增加变量命名分层：
   - 全大写下划线用于全局配置；
   - 首字母小写驼峰用于 Alfred 产生并传给脚本的稳定变量及标准输入；
   - 全小写下划线用于非公开的临时变量；
   - Alfred 内置变量保持平台原名。
5. 要求所有标准环境变量名在 app 代码中明确声明，禁止根据文件名或属性名动态生成。
6. 固定合并优先级：argv、app 驼峰标准变量、明确关联的全局配置、class 默认值。
7. 要求合并依据字段存在性，保留 `false`、`0`、空字符串和 `null`，最终由输入 class
   判断值是否合法。
8. 要求新入口同步添加标准输入 reference 文档和四类测试：argv-only、environment-only、
   混合输入、非标准输入隔离。
9. 规定内部 worker 可以豁免；其他豁免必须在需求或设计文档中明确说明原因。
10. 在 **Verification** 中补充：修改或新增 app 输入时，必须验证硬编码变量表、非标准输入
    隔离和 argv 覆盖环境变量的行为。

`AGENTS.md` 的修改应与通用解析能力在同一个实现变更中提交，避免规则先于能力存在，或
能力落地后没有后续入口约束。

### 16.5 阶段五：文档与完整验证

1. 更新 README 和标准输入 reference。
2. 确认 `workflow/info.plist` 不需要切换到标准输入。
3. 运行所有新增测试、`pnpm run check` 和 `git diff --check`。
4. 使用每个 app 的 argv-only、environment-only 和混合输入示例做一次构建产物验证。

## 17. 后续扩展

以下内容不属于首版，但协议预留 `version` 以便后续评估：

- 真正的 stdin JSON 输入；
- 多个标准输入对象的批处理；
- 输出协议版本协商；
- 自动生成 CLI help 或 JSON Schema；
- 将标准 app 输入封装为独立 npm API。
