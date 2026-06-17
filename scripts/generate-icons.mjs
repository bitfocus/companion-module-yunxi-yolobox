/**
 * Generate src/icons.generated.js
 *
 * Inline the PNGs under the icons/ directory that are referenced by constants.js as base64 data URLs into a single JS module.
 * This way the icons ship together with the bundle, requiring no filesystem reads at runtime and no dependency on import.meta.url ——
 * the latter would be statically replaced by webpack with the build machine's absolute path, causing the released version to crash on user machines (especially Windows).
 *
 * Usage: node scripts/generate-icons.mjs
 * Wired into the package script (yarn package runs this script first). The generated result is also committed to the repo,
 * so that even if CI calls companion-module-build directly, no files will be missing.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = path.join(rootDir, 'icons')
const constantsFile = path.join(rootDir, 'src', 'constants.js')
const outFile = path.join(rootDir, 'src', 'icons.generated.js')

// Collect all referenced icon names from constants.js (icon: / iconOn: / icons: [...])
const constants = fs.readFileSync(constantsFile, 'utf8')
const names = new Set()
for (const m of constants.matchAll(/\bicon(?:On)?:\s*'([^']+)'/g)) names.add(m[1])
for (const block of constants.matchAll(/\bicons:\s*\[([^\]]*)\]/g)) {
	for (const m of block[1].matchAll(/'([^']+)'/g)) names.add(m[1])
}

const sorted = [...names].sort()
const entries = []
const missing = []
for (const name of sorted) {
	const file = path.join(iconsDir, `${name}.png`)
	if (!fs.existsSync(file)) {
		missing.push(name)
		continue
	}
	const b64 = fs.readFileSync(file).toString('base64')
	entries.push(`\t${JSON.stringify(name)}: 'data:image/png;base64,${b64}',`)
}

if (missing.length) {
	console.warn(`[generate-icons] Warning: constants.js references ${missing.length} icon(s) that do not exist:`)
	for (const n of missing) console.warn(`  - ${n}.png`)
}

const header = `/**
 * Auto-generated, do not edit manually.
 * Run \`node scripts/generate-icons.mjs\` (or \`yarn package\`) to regenerate.
 *
 * Icons are inlined as base64 so the bundle output does not depend on the runtime filesystem or import.meta.url.
 */
`
const body = `const ICONS = {\n${entries.join('\n')}\n}\n\nexport default ICONS\n`
fs.writeFileSync(outFile, header + '\n' + body)

console.log(`[generate-icons] Wrote ${path.relative(rootDir, outFile)} (${entries.length} icons)`)
