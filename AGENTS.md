# EcoTag（权限版）技术架构

## 概述

本主题基于 MAML 语法编写，目标平台为小米背屏（REAREye）。**权限版需搭配 UriRoute 应用运行**，通过 `spec.js` 脚本采集硬件参数，由 `uriRoute.add()` 提供给界面。

## 核心差异

与主题版不同，权限版的数据来源是 UriRoute 脚本采集，而非系统 ContentProvider。这使得权限版可以获取设备电流、功率、温度、CPU 占用率等需要系统权限的硬件参数。

## UriRoute 数据采集架构

### spec.js（337 行）

数据采集脚本，核心结构：

```javascript
const CONFIG = {
  labelTitle: "EcoTag",
  labelSubtitle: "权限版",
  refreshInterval: 60,     // 刷新间隔（秒）
  slot1: 0,                // 槽位 1 参数编号
  slot2: 1,                // 槽位 2 参数编号
  slot3: 2,                // 槽位 3 参数编号
  slot4: 3,                // 槽位 4 参数编号
};

const paramPool = [
  { name: "剩余存储", value: "..." },
  { name: "开机时长", value: "..." },
  // ... 共 13 个参数
  { name: "充电状态", value: "..." },
];
```

通过 `uriRoute.add()` 将采集到的数据提供给界面层。

### uriroute.json

脚本元数据配置：

```json
{
  "scriptGroup": "wmqc",
  "version": 2,
  "cache": 600,
  "reareyeUri": {
    "themeId": "EcoTag_Root_v2.0",
    "archiveKey": "..."
  }
}
```

- **scriptGroup**：脚本组标识 `wmqc`
- **version**：配置版本 2
- **cache**：缓存 600 秒
- **reareyeUri**：关联 REAREye 主题 ID 和存档 Key

## MAML 语法约定

### 变量绑定

- **useVariableUpdater**：`Battery,DateTime.Second`
- **变量前缀**：`var.` 表示用户可配置变量

### 能效等级计算

通过 `batteryLevel` 变量判断：
- 1 级：>80%
- 2 级：>60% 且 ≤80%
- 3 级：>40% 且 ≤60%
- 4 级：>20% 且 ≤40%
- 5 级：≤20%

### 动画系统

- **充电流光动画**：`VariableAnimation` 0→360 度，2 秒循环
- **AOD 模式**：通过 `enterAod` / `exitAod` trigger 控制

### 布局元素

- **Arc / Line**：绘制胶囊电池路径
- **Text**：显示能效等级、数据指标
- **Image**：背景图、EcoTag图标

## 广播数据格式

通过 UriRoute 的 `uriRoute.add()` 推送数据，在 MAML 中通过 `VariableBinder` 绑定对应的变量名接收。

## 双机型适配

通过 `@screenWidth / @screenHeight` 宽高比判断 Pro 与 Pro Max，自动切换布局参数。

## 注意事项

1. **必须安装 UriRoute 应用**才能正常显示硬件参数
2. `spec.js` 和 `uriroute.json` 需在 UriRoute 中正确导入
3. `uriroute.json` 中的 `themeId` 必须与 `var_config.xml` 中的 `name` 匹配
4. 缓存 600 秒，数据不是实时刷新
5. manifest.xml 必须为 UTF-8 编码，所有 XML 标签必须正确闭合
6. 4 个槽位参数编号（0-13）需在变量配置中设置
