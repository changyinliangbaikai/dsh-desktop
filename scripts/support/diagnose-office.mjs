/** Probe the installed public converter with bundled fixtures, retaining redacted failure details. */
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditOfficeResources, diagnosticErrors, officeDiagnosticLayout } from './office-diagnostics.js';

const here = dirname(fileURLToPath(import.meta.url));
const layout = officeDiagnosticLayout(process.execPath);
const report = { schemaVersion: 2, platform: process.platform, architecture: process.arch,
  windowsKernel: release(), node: process.versions.node, electron: process.versions.electron,
  asar: layout.asar, tempPathHasNonAscii: /[^\x20-\x7e]/u.test(tmpdir()),
  applicationPathHasNonAscii: /[^\x20-\x7e]/u.test(process.execPath), checks: {} };
const save = () => writeFileSync(join(here, 'diagnostic-result.json'), JSON.stringify(report, null, 2) + '\n');
let scratch;
try {
  const metadata = JSON.parse(readFileSync(join(layout.application, 'package.json'), 'utf8'));
  report.applicationVersion = metadata.version;
  report.upstreamCommit = metadata.dshIntranetBuild?.upstream;
  report.downstreamVersion = metadata.dshIntranetBuild?.downstream;
  try { report.checks.resources = auditOfficeResources(layout.runtime); }
  catch (error) { report.checks.resources = { error: diagnosticErrors(error) }; }
  save();
  // Standalone processes need the physical public package closure, as the native Host does.
  const runtimeRequire = createRequire(join(layout.engineRuntime, 'package.json'));
  const { createConverter } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/libreoffice-kit')).href);
  report.converterVersion = JSON.parse(readFileSync(runtimeRequire.resolve('@deepseek-ai/libreoffice-kit/package.json'), 'utf8')).version;
  scratch = mkdtempSync(join(tmpdir(), 'dsh-office-diagnostic-'));
  const probe = async (name, filename, options = {}) => {
    let converter;
    const folder = join(scratch, name); mkdirSync(folder);
    report.checks[name] = { state: 'running' }; save();
    try {
      converter = await createConverter({ timeoutMs: 60000, ...options });
      const inputPath = join(folder, filename); const outputPath = join(folder, 'preview.pdf');
      copyFileSync(join(here, 'preview.docx'), inputPath);
      await converter.render({ inputPath, outputPath });
      const pdf = readFileSync(outputPath);
      report.checks[name] = { passed: pdf.subarray(0, 5).toString() === '%PDF-', bytes: pdf.length };
    } catch (error) { report.checks[name] = { passed: false, error: diagnosticErrors(error) }; }
    finally {
      try { await converter?.dispose(); } catch (error) { report.cleanupError = diagnosticErrors(error); }
      save();
    }
  };
  await probe('defaultConversion', 'preview.docx');
  await probe('unicodeFilename', '\u81ea\u6211\u4ecb\u7ecd.docx');
  if (!report.checks.defaultConversion.passed || !report.checks.unicodeFilename.passed) {
    await probe('withoutFontCache', '\u81ea\u6211\u4ecb\u7ecd.docx', { fontMetadataCacheDirectory: false });
    if (process.platform === 'win32' && process.env.SystemRoot) {
      await probe('systemFontsOnly', 'preview.docx', { fontMetadataCacheDirectory: false,
        fontDirectories: [join(process.env.SystemRoot, 'Fonts')] });
    }
  }
} catch (error) { report.error = diagnosticErrors(error); }
finally {
  try { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
  catch (error) { report.scratchCleanupError = diagnosticErrors(error); }
  save();
}
