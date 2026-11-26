# Harness Desktop 内网测试版

[English](README.md)

Windows x64 和 Linux x86_64 使用同一个 Harness 版本 **0.2.3-alpha.2**，对应上游标签提交 `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`。Windows **0.6.0-native.6** 从该标签构建原生客户端，Linux **0.6.0-kylin.2** 通过下游 Electron 壳运行官方 npm 运行时。两端内置同一份离线安装器 `0.10.0`。

Windows 为未签名内网测试包，内置 LibreOffice Kit 和 Windows 引擎 `0.2.3`。打包核对转换入口和引擎文件哈希。Word 预览与转换验证默认关闭，可按需开启。

## 本版行为

- 采用上游 ASAR 打包及完整 Office 引擎解包方式，转换组件随安装包提供。
- Windows 的 Office 转换还依赖 x64 Microsoft Visual C++ v14 运行库，上游转换组件未捆绑它。干净内网电脑需提前从[微软官方下载页](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)准备离线安装程序，并先安装运行库。构建机自带开发运行库，不能据此认定客户 Win10 已满足此条件。
- 使用上游原生托盘，首次关闭确认框显示在主窗口内；确认后，Windows 关闭按钮隐藏窗口到右下角托盘。左键点击恢复窗口；右键菜单可打开窗口或退出。退出仍由原生客户端清理 Host 和子进程。
- 内置插件入口为“设置 → 离线安装”。使用当前 Desktop Profile 和客户端自带 pnpm，禁用联网和安装脚本。安装后从托盘退出并重新启动客户端，插件即会加载。
- 声明旧版精确依赖的插件包须针对 Harness `0.2.3-alpha.2` 和 Cordis `4.2.0-alpha.1` 重建。第三方依赖需提前准备到离线存储。现有离线安装器的归档存储可继续使用。
- 通过打包配置默认关闭新增的产品使用统计。
- 原有 `web-search-deepseek` 和新增的 `web-deepseek-api` 提供方均默认停用，完整预设中不注册搜索工具。新增提供方同时包含可选的 API 网页读取；默认的 HTTP `web_fetch` 继续保留。模型地址和其他功能不因此自动变成离线模式。
- 不携带自动更新源和上游强制更新策略。请手动安装新的 GitHub 测试版本。

新版上游命令行启动器保持原样，随包提供字节完全相同的 `DeepSeek Harness.exe`
兼容启动文件，内网版名称和安装身份保持不变。CI 在安装后、阻断外网的条件下测试
`dsh.cmd --version`。因此安装目录会多保留一份 Electron 可执行文件。

上游 0.2.1 移除了运行时 invariant 插件及 `./invariant` 导出。引用这些入口的自定义
Profile 或扩展需调整；覆盖旧输入区 `stats` 行的扩展需迁移到 `activity`、`usage`。

## 构建与验证

构建命令见 [English README](README.md#build-and-release)。使用 Windows x64 和固定 Node/pnpm 版本，隔离上游检出位于工作区 `.artifacts/native-desktop/upstream`。

发布前检查完整运行时字节、未改动的原生入口、托盘图标、pnpm 和原生依赖；实际执行旧版安装升级、离线 CLI、认证后的插件上传安装，以及重启后插件激活。所有四个预设的 Web Search 停用和窗口关闭/恢复/退出检查仍为必需项。

Word 预览、Office 转换和诊断工具执行默认跳过，证据明确记录跳过状态；诊断 ZIP 仍随包提供。需要专项排查时，在工作流勾选 `validateOffice`，或在 staging 和 verify 前设置 `DSH_VALIDATE_OFFICE=1`。默认准备流程调用未修改的上游构建命令，并使用其 `prepare:dsh --defer-runtime-smoke` 参数延后包含 Office 转换的综合检查，最终运行时、Profile 和窗口检查仍会执行。

交互式托盘点击、卸载、界面观感及甲方内网模型连接仍属于实机验收。当前 Windows 构建读取 `packaging/native-upstream.json`。`packaging/runtime-manifest.json` 记录的是历史桌面壳。 [原生构建说明](docs/native-desktop.md)

## Win10 仍然预览失败时

下载对应版本的 `Dsh-Office-Diagnostics-<桌面版本>.zip`，解压到可写目录，
保持客户端打开，双击 `diagnose-office.cmd`。如弹出选择框，请选择已安装的客户端 EXE。
最长约五分钟，完成后将同目录 `diagnostic-result.json` 发回。工具只转换自带的中英文测试文档，
不读取您的 DOCX，不需要联网或另外安装 Node/Office；报告可区分资源缺失、底层转换错误、
中文文件名、字体缓存及系统字体差异。WPS 能打开文件不代表另一转换引擎一定兼容，
因此不把这次重构建单独视为预览问题已修复。

上游从 alpha.2 起将 pnpm 合并到 `runtime/primary-runtime/dependencies/pnpm`；验收脚本跟随新布局，插件继续通过公开的 `profileContext.packageManager` 调用。自定义 Profile 若仍包含已移除的子代理 `backgroundMode` 设置或 `DSH_TOOLS_MODE=both`，需按上游当前配置模式更新。Desktop 使用 pnpm 11.7.0，上游独立使用其固定的 pnpm 11.28.5。

本版使用 Cordis `4.2.0-alpha.1` 和 Schemastery `3.20.0-alpha.1`，离线安装器保留独立 npm 锁。设置页改用公开的 `settings.section` 注册方式，自定义 Host 路由应通过 WebServer 接口声明鉴权要求。归档校验和安装仍通过公开插件接口与官方包管理操作完成。

从 alpha.4 起原生运行时不再附带独立的 slots 包。离线安装器仅将 `dsh-client-ui-slots`
用于 TypeScript 类型和模块扩展，因此改为精确开发依赖；构建后的 Host/浏览器入口
不导入该包，slots 服务继续由上游渲染器提供。必需运行时 peer 的完整性检查保持不变。


未签名构建已跟随上游改用 `build --profile local` 和
`pack-local-packages.ts`；原生客户端、Host 和内置包均来自未修改的固定源码，
构建缓存也区分这一构建模式。

上游已将 `PROFILE_TEMPLATES`、`DEFAULT_PROFILE_BUNDLES` 从 `dsh-app-boot`
迁移到公开的 `dsh-official-bundles` 包，自定义集成需更新导入。
工具执行改由执行器插件负责；自定义 Profile 应移除旧 `tools.mode` /
`DSH_TOOLS_MODE` 覆盖，按当前 native/PTC 预设配置。离线安装器继续使用
上游公开的包操作接口，不实现这些上游行为。


Web 首页注入现在要求已验证的请求 Peer 上下文。自定义 Web 载体调用
`renderIndex` / `collectIndexInjections` 时需传递该上下文。Desktop 验收直接
检查认证后的实际 HTTP 页面，由原生服务器处理请求身份。

Harness 和离线安装器要求 Node `^24.22.3 || >=26.13.1`。Windows 安装包自带运行时，打包检查会读取 Electron 实际携带的 Node 版本。

## 银河麒麟 V10 Linux x86_64

`Harness-Desktop-0.6.0-kylin.2-linux-x86_64.deb` 面向使用 glibc 2.31 的银河麒麟桌面 V10 SP1 x86_64。从 kylin.1 升级前先关闭 Harness Desktop，再安装新文件。安装后从系统应用菜单打开 **Harness Desktop**，也可运行 `harness-desktop`。

```sh
sudo apt install ./Harness-Desktop-0.6.0-kylin.2-linux-x86_64.deb
```

安装包内置 Electron、Node.js、pnpm、官方已发布的 `@deepseek-ai/dsh@0.2.3-alpha.2` 和离线安装器 `0.10.0`。客户端启动经过认证的本机 Web Profile，沿用 Electron 用户数据目录中的 `dsh-home`。离线安装器接入 Alpha 2 的公开设置分区和 Web 路由鉴权，入口为“设置 → 离线安装”。声明旧版 Harness 精确 peer 的归档需要为 Alpha 2 重建。关闭窗口会停止 Host，重新打开客户端即可激活刚安装的插件。

从 kylin.1 升级后，首次启动会通过官方 CLI 更新原 Profile 中的离线安装器。安装包保留经校验的 `0.9.0` 归档，供更新期间解析原 Profile 中的文件依赖。

在 Linux x86_64 构建机上准备 Node.js `24.22.3`、pnpm `11.7.0` 和发行版的原生编译工具，在 Desktop 仓库中运行以下命令。

```sh
pnpm install --frozen-lockfile
pnpm run pack:linux
pnpm run test:linux-runtime
```

Linux 的版本清单和冻结依赖锁位于 `packaging/linux-x64/`。打包时复现两端共用的离线安装器及升级所需历史归档，运行时和安装包输出至 `.artifacts/linux-desktop/`。 [归档说明](plugins/dsh-offline-plugin-installer/compat/README.md)

每次推送或更新拉取请求时，GitHub 的 **Actions → Linux package** 会在 glibc 2.31 基线上构建。打包后的运行时通过检查后，可在对应运行的 **Artifacts** 中下载 **harness-desktop-linux-x86_64**，其中包含 `.deb` 和 `SHA256SUMS.txt`。
