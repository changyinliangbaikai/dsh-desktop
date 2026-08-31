const mode = process.env.FAKE_DSH_MODE ?? 'ready'

if (mode === 'early-exit') {
  process.stderr.write('profile failed\n')
  process.exit(23)
}

if (mode === 'silent') {
  setInterval(() => {}, 1_000)
} else if (mode === 'remote-url') {
  process.stdout.write('dsh web: http://10.0.0.8:4567\n')
  setInterval(() => {}, 1_000)
} else {
  process.stdout.write('loader ')
  setTimeout(() => {
    process.stdout.write('ready\n')
    process.stdout.write('dsh web: http://127.0.0.1:')
    setTimeout(() => {
      process.stdout.write('4567/?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n')
    }, 5)
  }, 5)
  setInterval(() => {}, 1_000)
}

if (mode === 'ignore-term') {
  process.on('SIGTERM', () => {})
} else {
  process.on('SIGTERM', () => {
    process.stderr.write('graceful stop\n')
    process.exit(0)
  })
}
