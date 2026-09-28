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
writeFileSync(join(output, '使用说明.txt'), '\ufeff解压到可写目录，保持客户端打开，双击 diagnose-office.cmd。\r\n如弹出文件选择框，请选择已安装的 Harness Desktop Intranet.exe。\r\n最长约五分钟。完成后将同目录 diagnostic-result.json 发回。无需安装 Node、Office 或联网。\r\n工具只读取安装组件并转换自带文档（英文及中文文件名），不读取您的文档，不修改程序、配置或工作区。\r\n失败时会比较禁用字体缓存、仅使用系统字体的结果。转换器可能更新其正常的字体元数据缓存。\r\n报告包含系统/运行库/组件版本、资源校验、错误代码及脱敏后的错误信息；不记录文档正文、绝对路径、令牌或 API Key。\r\n');
console.log(output);
