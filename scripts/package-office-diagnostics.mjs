/** Create a portable support kit without changing the installed application. */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifacts, repository } from './native-common.mjs';
const output = join(artifacts, 'office-diagnostics');
mkdirSync(output, { recursive: true });
for (const file of ['diagnose-office.mjs', 'diagnose-office.ps1', 'diagnose-office.cmd']) {
  copyFileSync(join(repository, 'scripts/support', file), join(output, file));
}
copyFileSync(join(repository, 'dist/native/office-diagnostics.js'), join(output, 'office-diagnostics.js'));
copyFileSync(join(repository, 'tests/fixtures/native/preview.docx'), join(output, 'preview.docx'));
writeFileSync(join(output, 'package.json'), '{"type":"module","private":true}\n');
writeFileSync(join(output, '使用说明.txt'), '\ufeff解压到可写目录，保持客户端打开，双击 diagnose-office.cmd。\r\n如弹出文件选择框，请选择已安装的 Harness Desktop Intranet.exe。\r\n完成后将同目录 diagnostic-result.json 发回。无需安装 Node、Office 或联网。\r\n工具只读取安装目录并转换自带测试文档，不修改程序、用户配置或工作区文件。\r\n报告含系统版本、组件版本、资源校验和错误代码，不含文档正文、用户名、绝对路径、令牌或 API Key。\r\n');
console.log(output);
