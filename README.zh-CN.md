# Harness Desktop 内网测试版

[English](README.md)

此分支使用固定的 DSH 原生桌面客户端 **0.2.1-alpha.4**，上游提交 `86a402200d95fecef4529d969836f1fe13c6cb0d`。下游测试版本 **0.6.0-native.3**，Windows x64，未签名。上游源码及原生 main.js 保持不变。

本次固定上游已发布的 `dsh-v0.2.1-alpha.4` 标签。离线安装插件使用重新解析的独立 npm 锁文件和精确的 0.2.1-alpha.4 依赖；旧 Harness 版本的插件包需重建后安装。运行时依赖解析为 LibreOffice Kit 0.1.5 和 Windows 引擎 0.1.5，使用匹配的官方 Windows 引擎包；打包时核对版本及入口/引擎文件哈希。客户已确认更新客户端和 x64 运行库后 Word 预览恢复正常，后续构建按要求默认跳过该专项验证。

## 本版行为

- 采用上游 ASAR 打包及完整 Office 依赖解包方式，LibreOffice Kit 升至 0.1.5。无需运行时下载引擎或另外安装 Office。
- Windows 的 Office 转换还依赖 x64 Microsoft Visual C++ v14 运行库，上游转换组件未捆绑它。干净内网电脑需提前从[微软官方下载页](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)准备离线安装程序，并先安装运行库。构建机自带开发运行库，不能据此认定客户 Win10 已满足此条件。
- 使用上游原生托盘，首次关闭确认后，Windows 关闭按钮隐藏窗口到右下角托盘。左键点击恢复窗口；右键菜单可打开窗口或退出。退出仍由原生客户端清理 Host 和子进程。
- 内置独立插件 `dsh-offline-plugin-installer@0.7.0`，入口为“设置 → 插件 → 离线安装”。使用当前 desktop Profile 和客户端自带 pnpm，禁用联网与安装脚本。安装后需从托盘选择退出，再重新启动才能加载；仅关闭窗口不会重启。
- 旧插件仍声明 Harness 0.2.1-alpha.3 或更早版本兼容时会被拒绝，必须针对 0.2.1-alpha.4 重建。依赖未在离线存储中准备好的包无法安装。插件数据无需迁移，但更高版本 Harness 写入的会话不承诺可降级。
- 通过打包配置默认关闭新增的产品使用统计。
- Web Search 提供方和完整预设中的搜索默认停用；保留 web_fetch。模型地址和其他功能不因此自动变成离线模式。
- 不携带自动更新源和上游强制更新策略。请手动安装新的 GitHub 测试版本。

新版上游命令行启动器保持原样，随包提供字节完全相同的 `DeepSeek Harness.exe`
兼容启动文件，内网版名称和安装身份保持不变。CI 在安装后、阻断外网的条件下测试
`dsh.cmd --version`。因此安装目录会多保留一份 Electron 可执行文件。

上游 0.2.1 移除了运行时 invariant 插件及 `./invariant` 导出。引用这些入口的自定义
Profile 或扩展需调整；覆盖旧输入区 `stats` 行的扩展需迁移到 `activity`、`usage`。
旧版插件包需针对 Harness 0.2.1-alpha.4 和 Cordis 4.0.5-alpha.2 重建，离线安装器的
归档存储无需迁移。

## 构建与验证

构建命令见 [English README](README.md#build-and-release)。使用 Windows x64 和固定 Node/pnpm 版本，隔离上游检出位于工作区 `.artifacts/native-desktop/upstream`。

发布前检查完整运行时字节、未改动的原生入口、托盘图标、pnpm 和原生依赖；实际执行旧版安装升级、离线 CLI、认证后的插件上传安装，以及重启后插件激活。所有四个预设的 Web Search 停用和窗口关闭/恢复/退出检查仍为必需项。

Word 预览、Office 转换和诊断工具执行默认跳过，证据明确记录跳过状态；诊断 ZIP 仍随包提供。需要专项排查时，在工作流勾选 `validateOffice`，或在 staging 和 verify 前设置 `DSH_VALIDATE_OFFICE=1`。默认准备流程调用未修改的上游构建命令，并使用其 `prepare:dsh --defer-runtime-smoke` 参数延后包含 Office 转换的综合检查，最终运行时、Profile 和窗口检查仍会执行。

交互式托盘点击、安装卸载、界面观感及甲方内网模型连接仍属于实机验收。原有壳源码保留作回归参考，但不作为本版入口。此候选版本不推进工作区 `workspace.lock.json` 的全插件兼容基线。

## Win10 仍然预览失败时

从 Releases 下载对应的 `Dsh-Office-Diagnostics-0.6.0-native.3.zip`，解压到可写目录，
保持客户端打开，双击 `diagnose-office.cmd`。如弹出选择框，请选择已安装的客户端 EXE。
最长约五分钟，完成后将同目录 `diagnostic-result.json` 发回。工具只转换自带的中英文测试文档，
不读取您的 DOCX，不需要联网或另外安装 Node/Office；报告可区分资源缺失、底层转换错误、
中文文件名、字体缓存及系统字体差异。WPS 能打开文件不代表另一转换引擎一定兼容，
因此不把这次重构建单独视为预览问题已修复。

本次 alpha.2 将 pnpm 合并到 `runtime/primary-runtime/dependencies/pnpm`；验收脚本跟随新布局，插件继续通过公开的 `profileContext.packageManager` 调用。自定义 Profile 若仍包含已移除的子代理 `backgroundMode` 设置或 `DSH_TOOLS_MODE=both`，需按上游当前配置模式更新。Desktop 使用 pnpm 11.7.0，上游独立使用其固定的 pnpm 11.28.5。

本次 alpha.4 同时升级 Cordis、Schemastery 至对应 alpha.2 版本。上游现在优先检查
显式 `engines.dsh`，未提供时检查 DSH peers；本离线安装器继续执行既定的精确 peer
校验，旧插件包需针对固定的 Harness/Cordis 版本重建，不使用兼容豁免或放宽校验。
认证请求接纳和包安装仍使用上游公开接口，不复制上游认证或插件管理实现。

alpha.4 原生运行时不再附带独立的 slots 包。离线安装器仅将 `dsh-client-ui-slots`
用于 TypeScript 类型和模块扩展，因此改为精确开发依赖；构建后的 Host/浏览器入口
不导入该包，slots 服务继续由上游渲染器提供。必需运行时 peer 的完整性检查保持不变。
