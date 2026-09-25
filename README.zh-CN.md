# Harness Desktop 内网测试版

[English](README.md)

此分支使用固定的 DSH 原生桌面客户端 **0.1.7-rc.2**，上游提交 `477b4f420553e8a52c2fbccc464d7561b239c443`。下游测试版本 **0.4.0-native.1**，Windows x64，未签名。上游源码及原生 main.js 保持不变。

## 本版行为

- 采用上游 ASAR 打包及完整 Office 依赖解包方式，LibreOffice Kit 升至 0.1.1。无需运行时下载引擎或另外安装 Office。
- 使用上游原生托盘，首次关闭确认后，Windows 关闭按钮隐藏窗口到右下角托盘。左键点击恢复窗口；右键菜单可打开窗口或退出。退出仍由原生客户端清理 Host 和子进程。
- 内置独立插件 `dsh-offline-plugin-installer@0.3.0`，入口为“设置 → 插件 → 离线安装”。使用当前 desktop Profile 和客户端自带 pnpm，禁用联网与安装脚本。安装后需从托盘选择退出，再重新启动才能加载；仅关闭窗口不会重启。
- 旧插件仍声明 Harness 0.1.6-alpha.2 或更早版本兼容时会被拒绝，必须针对 0.1.7-rc.2 重建。依赖未在离线存储中准备好的包无法安装。插件数据无需迁移，但更高版本 Harness 写入的会话不承诺可降级。
- Web Search 提供方和完整预设中的搜索默认停用；保留 web_fetch。模型地址和其他功能不因此自动变成离线模式。
- 不携带自动更新源和上游强制更新策略。请手动安装新的 GitHub 测试版本。

## 构建与验证

构建命令见 [English README](README.md#build-and-release)。使用 Windows x64 和固定 Node/pnpm 版本，隔离上游检出位于工作区 `.artifacts/native-desktop/upstream`。

发布前检查完整运行时字节、未改动的原生入口及上游托盘图标；使用最终应用的运行时实际执行 DOCX/XLSX/PPTX→PDF 和独立 Office CLI、认证后的插件上传安装、随包 pnpm 离线操作，以及重启后插件激活。所有四个预设也需通过 Web Search 停用检查。

交互式托盘点击、安装卸载、界面观感及甲方内网模型连接仍属于实机验收。原有壳源码保留作回归参考，但不作为本版入口。此候选版本不推进工作区 `workspace.lock.json` 的全插件兼容基线。
