import { rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))

for (const name of ['lib', 'coverage']) {
  const target = resolve(root, name)
  if (!target.startsWith(root + sep)) throw new Error(`Refusing to remove unsafe path ${target}`)
  await rm(target, { recursive: true, force: true })
}
