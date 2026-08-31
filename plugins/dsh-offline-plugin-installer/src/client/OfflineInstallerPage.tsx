import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { InstallerSessionSnapshot, InstallSuccessResponse } from '../api/types.js'
import type { OfflineInstallerLocaleKey } from './locales.js'

export interface OfflineInstallerPageInjected {
  readonly loadSession: (signal: AbortSignal) => Promise<InstallerSessionSnapshot>
  readonly installPackage: (
    file: File,
    session: InstallerSessionSnapshot,
    signal: AbortSignal,
  ) => Promise<InstallSuccessResponse>
}

export type OfflineInstallerPageProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.offlinePluginInstaller'>
  & InjectFace<OfflineInstallerPageInjected>

type SessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly session: InstallerSessionSnapshot }

type InstallState =
  | { readonly status: 'idle' }
  | { readonly status: 'installing' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'success'; readonly result: InstallSuccessResponse }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GiB`
}

function validateFile(
  file: File,
  session: InstallerSessionSnapshot,
  t: OfflineInstallerPageProps['t'],
): string | undefined {
  if (!file.name.toLowerCase().endsWith(session.acceptedExtension)) return t('invalidExtension')
  if (file.size === 0) return t('invalidExtension')
  if (file.size > session.maxUploadBytes) return t('tooLarge')
  return undefined
}

/** Explicit upload-and-install tab in Settings > Plugins. */
export function OfflineInstallerPage(props: OfflineInstallerPageProps): ReactNode {
  const { installPackage, loadSession, t } = props
  const inputRef = useRef<HTMLInputElement>(null)
  const installController = useRef<AbortController>()
  const [sessionRequest, setSessionRequest] = useState(0)
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' })
  const [file, setFile] = useState<File>()
  const [fileError, setFileError] = useState<string>()
  const [installState, setInstallState] = useState<InstallState>({ status: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    setSessionState({ status: 'loading' })
    void loadSession(controller.signal).then(session => {
      setSessionState({ status: 'ready', session })
    }, error => {
      if (!controller.signal.aborted) setSessionState({ status: 'error', message: errorMessage(error) })
    })
    return () => { controller.abort() }
  }, [loadSession, sessionRequest])

  useEffect(() => () => { installController.current?.abort() }, [])

  const selectFile = (candidate: File): void => {
    if (sessionState.status !== 'ready') return
    const validation = validateFile(candidate, sessionState.session, t)
    setFileError(validation)
    setFile(validation === undefined ? candidate : undefined)
    setInstallState({ status: 'idle' })
  }
  const onInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const candidate = event.currentTarget.files?.[0]
    if (candidate !== undefined) selectFile(candidate)
    event.currentTarget.value = ''
  }
  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const candidate = event.dataTransfer.files[0]
    if (candidate !== undefined) selectFile(candidate)
  }
  const clear = (): void => {
    setFile(undefined)
    setFileError(undefined)
    setInstallState({ status: 'idle' })
  }
  const install = (): void => {
    if (file === undefined || sessionState.status !== 'ready' || installState.status === 'installing') return
    const controller = new AbortController()
    installController.current = controller
    setInstallState({ status: 'installing' })
    void installPackage(file, sessionState.session, controller.signal).then(result => {
      setInstallState({ status: 'success', result })
    }, error => {
      if (!controller.signal.aborted) setInstallState({ status: 'error', message: errorMessage(error) })
    }).finally(() => {
      if (installController.current === controller) installController.current = undefined
    })
  }

  return (
    <div className="dopi-page" aria-busy={installState.status === 'installing'}>
      <header className="dopi-header">
        <span className="dopi-eyebrow">{t('eyebrow')}</span>
        <h2>{t('title')}</h2>
        <p>{t('subtitle')}</p>
      </header>

      <section className="dopi-security" aria-label={t('securityTitle')}>
        <span className="dopi-security-icon" aria-hidden="true">✓</span>
        <div><strong>{t('securityTitle')}</strong><p>{t('securityBody')}</p></div>
      </section>

      {sessionState.status === 'loading' ? (
        <div className="dopi-state" role="status">{t('loading')}</div>
      ) : null}
      {sessionState.status === 'error' ? (
        <div className="dopi-error" role="alert">
          <strong>{t('sessionError')}</strong>
          <span>{sessionState.message}</span>
          <button type="button" onClick={() => { setSessionRequest(value => value + 1) }}>{t('retry')}</button>
        </div>
      ) : null}

      {sessionState.status === 'ready' && installState.status !== 'success' ? (
        <>
          <div className="dopi-meta" aria-label={t('profile')}>
            <span><small>{t('profile')}</small><strong>{sessionState.session.profile}</strong></span>
            <span><small>{t('sizeLimit')}</small><strong>{formatBytes(sessionState.session.maxUploadBytes)}</strong></span>
          </div>
          <div
            className="dopi-dropzone"
            onDragOver={event => { event.preventDefault() }}
            onDrop={onDrop}
            onClick={() => { inputRef.current?.click() }}
            role="button"
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
            }}
          >
            <span className="dopi-upload-icon" aria-hidden="true">↑</span>
            <strong>{t('dropTitle')}</strong>
            <span>{t('dropBody')}</span>
            <button type="button" onClick={event => { event.stopPropagation(); inputRef.current?.click() }}>
              {t('choose')}
            </button>
            <input ref={inputRef} type="file" accept=".tgz,application/gzip" onChange={onInput} hidden />
          </div>
          {fileError !== undefined ? <p className="dopi-inline-error" role="alert">{fileError}</p> : null}
          {file !== undefined ? (
            <div className="dopi-selected">
              <div><small>{t('selected')}</small><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
              <button type="button" onClick={clear} disabled={installState.status === 'installing'}>{t('clear')}</button>
            </div>
          ) : null}
          <p className="dopi-note">{t('offlineNote')}</p>
          {installState.status === 'error' ? (
            <div className="dopi-error" role="alert"><strong>{t('errorTitle')}</strong><span>{installState.message}</span></div>
          ) : null}
          <button
            className="dopi-install"
            type="button"
            disabled={file === undefined || installState.status === 'installing'}
            onClick={install}
          >
            {installState.status === 'installing' ? t('installing') : t('install')}
          </button>
        </>
      ) : null}

      {installState.status === 'success' ? (
        <section className="dopi-success" role="status">
          <span className="dopi-success-mark" aria-hidden="true">✓</span>
          <h3>{t('successTitle')}</h3>
          <p>{t('successBody')}</p>
          <dl>
            <div><dt>{t('package')}</dt><dd>{installState.result.package.name}</dd></div>
            <div><dt>{t('version')}</dt><dd>{installState.result.package.version}</dd></div>
            <div><dt>{t('checksum')}</dt><dd><code>{installState.result.package.sha256}</code></dd></div>
          </dl>
          {installState.result.warningCodes.length > 0 ? <p className="dopi-warning">{t('dependencyWarning')}</p> : null}
          <button type="button" onClick={clear}>{t('installAnother')}</button>
        </section>
      ) : null}
    </div>
  )
}
