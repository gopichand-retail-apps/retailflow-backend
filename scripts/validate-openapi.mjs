import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const spec = JSON.parse(await readFile(new URL('../openapi.json', import.meta.url), 'utf8'))
const requiredPaths = [
  '/health',
  '/api/v1/auth/demo-login',
  '/api/v1/auth/demo-roles',
  '/api/v1/auth/me',
  '/api/v1/auth/logout',
  '/api/v1/overview',
  '/api/v1/products',
  '/api/v1/products/{productId}/adjustments',
  '/api/v1/sales',
  '/api/v1/sales/quote',
  '/api/v1/sales/{saleId}',
  '/api/v1/sales/{saleId}/returns',
  '/api/v1/settings',
]

assert.equal(spec.openapi, '3.1.0', 'OpenAPI version must remain 3.1.0')
for (const path of requiredPaths) {
  assert.ok(spec.paths[path], `OpenAPI path is missing: ${path}`)
}

const references = []
function collectReferences(value) {
  if (Array.isArray(value)) {
    value.forEach(collectReferences)
    return
  }

  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref' && typeof nested === 'string' && nested.startsWith('#/components/')) {
      references.push(nested)
      continue
    }

    collectReferences(nested)
  }
}

collectReferences(spec)
for (const reference of references) {
  const path = reference
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
  let target = spec
  for (const part of path) target = target?.[part]
  assert.notEqual(target, undefined, `OpenAPI reference is unresolved: ${reference}`)
}

assert.ok(spec.components.schemas.CheckoutRequest.properties.tenders, 'Checkout tenders must be documented')
process.stdout.write(`OpenAPI validation passed: ${requiredPaths.length} paths, ${references.length} references\n`)
