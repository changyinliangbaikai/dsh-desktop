// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstallerSessionSnapshot, InstallSuccessResponse } from '../../src/api/types.js'
import { OfflineInstallerPage, type OfflineInstallerPageProps } from '../../src/client/OfflineInstallerPage.js'
import { zh, type OfflineInstallerLocaleKey } from '../../src/client/locales.js'

afterEach(cleanup)

const session: InstallerSessionSnapshot = {
  token: 'a'.repeat(43), profile: 'web', maxUploadBytes: 1024,
  acceptedExtension: '.tgz', networkDisabled: true, lifecycleScriptsDisabled: true,
}
const success: InstallSuccessResponse = {
  ok: true,
  package: {
    name: 'dsh-fixture-plugin', version: '1.2.3', sha256: 'b'.repeat(64),
    archiveBytes: 3, expandedBytes: 10, entryCount: 3, runtimeDependencies: ['local-only'],
  },
  restartRequired: true,
  warningCodes: ['RUNTIME_DEPENDENCIES_REQUIRE_OFFLINE_STORE'],
}

function t(key: OfflineInstallerLocaleKey): string { return zh[key] }

function props(overrides: Partial<OfflineInstallerPageProps> = {}): OfflineInstallerPageProps {
  return {
    t,
    loadSession: () => Promise.resolve(session),
    installPackage: () => Promise.resolve(success),
    ...overrides,
  } as OfflineInstallerPageProps
}

describe('OfflineInstallerPage', () => {
  it('selects, validates, installs, and renders restart-required package facts', async () => {
    const installPackage = vi.fn().mockResolvedValue(success)
    render(<OfflineInstallerPage {...props({ installPackage })} />)
    await screen.findByText('web')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['tgz'], 'my-plugin.tgz', { type: 'application/gzip' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(screen.getByText('my-plugin.tgz')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '上传并安装' }))
    await waitFor(() => { expect(installPackage).toHaveBeenCalledWith(file, session, expect.any(AbortSignal)) })

    expect(await screen.findByText('插件包已安装')).toBeTruthy()
    expect(screen.getByText('dsh-fixture-plugin')).toBeTruthy()
    expect(screen.getByText('1.2.3')).toBeTruthy()
    expect(screen.getByText('b'.repeat(64))).toBeTruthy()
    expect(screen.getByText(/退出并重新打开应用/)).toBeTruthy()
    expect(screen.getByText(/声明了运行时依赖/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '安装另一个插件包' }))
    expect(screen.getByText('拖入 .tgz 插件包')).toBeTruthy()
  })

  it('rejects invalid local files and contains Host installation failures', async () => {
    const installPackage = vi.fn().mockRejectedValue(new Error('peer mismatch'))
    render(<OfflineInstallerPage {...props({ installPackage })} />)
    await screen.findByText('web')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['zip'], 'plugin.zip')] } })
    expect(screen.getByRole('alert').textContent).toContain('.tgz')

    const oversized = new File([new Uint8Array(1025)], 'large.tgz')
    fireEvent.drop(screen.getByRole('button', { name: /拖入 .tgz 插件包/ }), {
      dataTransfer: { files: [oversized] },
    })
    expect(screen.getByRole('alert').textContent).toContain('上传大小')

    const valid = new File(['tgz'], 'plugin.tgz')
    fireEvent.change(input, { target: { files: [valid] } })
    fireEvent.click(screen.getByRole('button', { name: '上传并安装' }))
    expect(await screen.findByText('peer mismatch')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('安装未完成')
  })

  it('retries a failed session request', async () => {
    const loadSession = vi.fn()
      .mockRejectedValueOnce(new Error('host offline'))
      .mockResolvedValueOnce(session)
    render(<OfflineInstallerPage {...props({ loadSession })} />)
    expect(await screen.findByText('host offline')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('web')).toBeTruthy()
    expect(loadSession).toHaveBeenCalledTimes(2)
  })

  it('supports keyboard selection and aborts an in-flight upload when the tab unmounts', async () => {
    let observedSignal: AbortSignal | undefined
    const installPackage = vi.fn((_file: File, _session: InstallerSessionSnapshot, signal: AbortSignal) => {
      observedSignal = signal
      return new Promise<InstallSuccessResponse>(() => {})
    })
    const view = render(<OfflineInstallerPage {...props({ installPackage })} />)
    await screen.findByText('web')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    fireEvent.keyDown(screen.getByRole('button', { name: /拖入 .tgz 插件包/ }), { key: 'Enter' })
    expect(click).toHaveBeenCalled()
    const file = new File(['tgz'], 'plugin.tgz')
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: '上传并安装' }))
    await waitFor(() => { expect(observedSignal).toBeDefined() })
    view.unmount()
    expect(observedSignal?.aborted).toBe(true)
  })
})
