import { copyFile, mkdir } from 'node:fs/promises'

const destination = new URL('../dist/db/migrations/', import.meta.url)
await mkdir(destination, { recursive: true })
await copyFile(
  new URL('../src/db/migrations/001_initial.sql', import.meta.url),
  new URL('001_initial.sql', destination),
)
