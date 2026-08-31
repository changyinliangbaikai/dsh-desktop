const mode = process.env.FAKE_DSH_CLI_MODE ?? 'success'

if (mode === 'success') {
  process.stdout.write(JSON.stringify(process.argv.slice(2)) + '\n')
  process.exit(0)
}

if (mode === 'fail') {
  process.stderr.write('offline dependency unavailable\n')
  process.exit(17)
}

if (mode === 'large-output') {
  process.stdout.write('x'.repeat(4096))
  process.exit(0)
}

process.stdout.write('waiting\n')
setInterval(() => {}, 10_000)
