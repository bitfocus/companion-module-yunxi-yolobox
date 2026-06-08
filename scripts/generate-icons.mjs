/**
 * 生成 src/icons.generated.js
 *
 * 把 icons/ 目录下「被 constants.js 引用到的」PNG 以 base64 data URL 内联成一个 JS 模块。
 * 这样图标随 bundle 一起分发，运行时无需读文件系统，也不依赖 import.meta.url —— 后者会被
 * webpack 静态替换成「构建机器的绝对路径」，导致发布版在用户机器（尤其 Windows）上崩溃。
 *
 * 用法：node scripts/generate-icons.mjs
 * 已接入 package 脚本（yarn package 会先执行本脚本）。生成结果同时提交进仓库，
 * 即便 CI 直接调用 companion-module-build 也不会缺文件。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = path.join(rootDir, 'icons')
const constantsFile = path.join(rootDir, 'src', 'constants.js')
const outFile = path.join(rootDir, 'src', 'icons.generated.js')

// 从 constants.js 收集所有被引用的图标名（icon: / iconOn: / icons: [...]）
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
	console.warn(`[generate-icons] 警告：constants.js 引用了 ${missing.length} 个不存在的图标：`)
	for (const n of missing) console.warn(`  - ${n}.png`)
}

const header = `/**
 * 自动生成，请勿手动编辑。
 * 运行 \`node scripts/generate-icons.mjs\`（或 \`yarn package\`）重新生成。
 *
 * 图标以 base64 内联，使打包产物不依赖运行时文件系统与 import.meta.url。
 */
`
const body = `const ICONS = {\n${entries.join('\n')}\n}\n\nexport default ICONS\n`
fs.writeFileSync(outFile, header + '\n' + body)

console.log(`[generate-icons] 已写入 ${path.relative(rootDir, outFile)}（${entries.length} 个图标）`)
