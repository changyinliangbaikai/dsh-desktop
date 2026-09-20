# Harness Desktop 内网测试版

[English](README.md)

本分支使用 **DeepSeek Harness 原生 Electron 桌面客户端**，固定版本 **0.1.6-alpha.2**、提交 `ddefc45fbc7f8e46dd73185e68295696d1297887`。Dsh-Desktop 负责构建编排与内网默认配置，新安装包不再使用旧的自制 Electron 壳。

发布标签为 **desktop-v0.3.0-native.1**，客户端与内置 Harness 都保留原生版本 **0.1.6-alpha.2**。安装名称为 **Harness Desktop Intranet**，使用独立应用标识，属于未签名 Windows x64 测试版。

## 内网默认配置

- 停用 DeepSeek Web Search 服务；standard、ptc、cordis 三个 Agent 预设均显式配置 `search: false`，新会话不再暴露 `web_search`。minimal 本身无 Web 工具。
- 保留 `web_fetch`、模型接口、权限、原生插件管理和 Office 能力。此次是默认配置调整，不是网络隔离机制；用户仍可自行修改预设与 Profile。
- 不嵌入自动更新地址、上游强制更新服务或飞书测试登录配置，测试版后续从 GitHub 手动下载升级。
- 不包含旧壳的关闭到托盘逻辑和离线安装插件引导。旧离线安装插件面向 Harness 0.1.2-rc.1，尚未适配新版本，请勿直接安装旧归档。
- 原生桌面使用 `$DSH_HOME/profiles/desktop`，可能与 CLI 共享部分用户数据。测试新 Harness 前请备份既有数据；新会话格式不保证可降级读取。

## 构建与下载

GitHub 的 **Windows package** 工作流在 Windows x64 上执行原生构建。发布标签必须与仓库 package.json 一致；全部验证通过后自动创建 GitHub 预发布，提供 EXE、SHA256SUMS.txt、配置差异摘要和构建证据。手动运行默认仅产生 Actions 临时产物；勾选 publish 后，验证通过即从该次精确提交创建版本标签与预发布。

本地构建需要 Windows x64、Node 24、pnpm 11.7.0、Python、Visual C++ Build Tools 和 Windows SDK。目录约定与完整命令见 [英文说明](README.md#build-and-release)。上游固定提交检出到工作区 `.artifacts/native-desktop/upstream`，安装包位于 `.artifacts/native-desktop/release`；现有 deepseek-harness 目录保持只读。

打包阶段仅调整生成资源中的四个 YAML 配置文件，记录变更前后散列并重新验证原生运行时清单；不修改上游源码。安装包内的原生主进程代码必须与该提交构建结果逐字节一致。

## 验证边界

保留旧壳和旧插件的回归检查，并新增内网配置测试。Windows 构建另行验证安装包资源、原生 Host 启动、Web 页面和四个预设的真实工具注册表，不调用付费模型 API。交互式安装、界面效果、内网模型访问、Windows 安全软件兼容性仍需下载后实测。未签名状态不等同于生产发布。

本次为候选原生桌面版本，不提升工作区已验收插件栈的版本锁。详见 [构建架构](docs/native-desktop.md)。
