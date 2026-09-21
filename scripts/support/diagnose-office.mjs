/** Standalone installed-runtime probe. Only its bundled fixture is converted. */
import { createRequire } from 'node:module';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { release, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditOfficeResources, errorCodes } from './office-diagnostics.js';

const here = dirname(fileURLToPath(import.meta.url));
const application = join(dirname(process.execPath), 'resources/app');
const runtime = join(application, 'dsh');
const report = { schemaVersion: 1, platform: process.platform, architecture: process.arch,
  windowsKernel: release(), node: process.versions.node, electron: process.versions.electron, checks: {} };
let scratch;
let converter;
try {
  const metadata = JSON.parse(readFileSync(join(application, 'package.json'), 'utf8'));
  report.applicationVersion = metadata.version;
  report.upstreamCommit = metadata.dshIntranetBuild?.upstream;
  try { report.checks.resources = auditOfficeResources(runtime); }
  catch (error) { report.checks.resources = { error: errorCodes(error) }; }
  const runtimeRequire = createRequire(join(runtime, 'package.json'));
  const { createConverter } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/libreoffice-kit')).href);
  try {
    converter = await createConverter({ timeoutMs: 60000 });
    report.checks.engineResolution = 'passed';
  } catch (error) {
    report.checks.engineResolution = { error: errorCodes(error) };
    throw error;
  }
  scratch = mkdtempSync(join(tmpdir(), 'dsh-office-diagnostic-'));
  const inputPath = join(scratch, 'preview.docx');
  const outputPath = join(scratch, 'preview.pdf');
  copyFileSync(join(here, 'preview.docx'), inputPath);
  try {
    await converter.render({ inputPath, outputPath });
    const pdf = readFileSync(outputPath);
    report.checks.conversion = { passed: pdf.subarray(0, 5).toString() === '%PDF-', bytes: pdf.length };
  } catch (error) { report.checks.conversion = { error: errorCodes(error) }; }
} catch (error) { report.error = errorCodes(error); }
finally {
  try { await converter?.dispose(); }
  catch (error) { report.cleanupError = errorCodes(error); }
  try { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
  catch (error) { report.scratchCleanupError = errorCodes(error); }
  writeFileSync(join(here, 'diagnostic-result.json'), JSON.stringify(report, null, 2) + '\n');
}
