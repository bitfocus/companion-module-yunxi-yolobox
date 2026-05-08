/**
 * YoloBox Companion Module - Preset Definitions
 * 预设按钮配置，用户可从 Companion 面板直接拖拽到按键上
 */

import { combineRgb } from '@companion-module/base'
import { ActionRegistry, ActionTypes } from './constants.js'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ICONS_DIR = path.join(__dirname, '..', 'icons')

const COLOR_OFF = combineRgb(0, 0, 0)
const COLOR_ON = combineRgb(0, 200, 0)
const COLOR_LIVE = combineRgb(200, 0, 0)
const COLOR_WHITE = combineRgb(255, 255, 255)
const COLOR_GRAY = combineRgb(128, 128, 128)

/**
 * 尝试加载图标文件，返回 base64 编码或 undefined
 */
function loadIcon(iconName) {
	const iconPath = path.join(ICONS_DIR, `${iconName}.png`)
	try {
		if (fs.existsSync(iconPath)) {
			const data = fs.readFileSync(iconPath)
			return `data:image/png;base64,${data.toString('base64')}`
		}
	} catch (e) {
		// 图标不存在则不设置
	}
	return undefined
}

/**
 * 注册所有 presets 到 Companion 实例
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupPresets(self) {
	const presets = {}
	const supported = self.supportedProperties // null = 全部显示

	for (const [actionId, config] of Object.entries(ActionRegistry)) {
		if (config.functions && config.functions.length > 0) {
			// 为每个 function 创建一个 preset
			for (const func of config.functions) {
				// 如果设备不支持该 property，跳过
				if (supported && !supported.has(func.property)) continue
				const presetId = `${actionId}_${func.name}`
				const icon = loadIcon(func.icon)

				const preset = {
					type: 'button',
					category: config.category,
					name: func.description,
					style: {
						text: func.description,
						size: 'auto',
						color: COLOR_WHITE,
						bgcolor: COLOR_OFF,
					},
					steps: [
						{
							down: [
								{
									actionId: actionId,
									options: {
										selectedFunction: func.name,
									},
								},
							],
							up: [],
						},
					],
					feedbacks: [],
				}

				// 设置图标
				if (icon) {
					preset.style.png64 = icon
					preset.style.text = ''
				}

				// 如果是有状态的 Boolean 类型，添加 feedback
				if (config.hasState && func.actionType === ActionTypes.BOOLEAN) {
					preset.feedbacks.push({
						feedbackId: `${actionId}_state`,
						options: {
							selectedFunction: func.name,
						},
						style: {
							bgcolor: COLOR_ON,
							color: COLOR_WHITE,
						},
					})

					// 如果有 iconOn，在 feedback 中使用
					const iconOn = loadIcon(func.iconOn)
					if (iconOn) {
						preset.feedbacks[0].style.png64 = iconOn
						preset.feedbacks[0].style.text = ''
					}
				}

				// Source 类型：添加特殊 feedback
				if (func.actionType === ActionTypes.DYNAMIC && actionId === 'source') {
					preset.feedbacks.push({
						feedbackId: 'source_active',
						options: {
							sourceIndex: func.name,
						},
					})
				}

				// Overlay 类型：添加特殊 feedback
				if (func.actionType === ActionTypes.DYNAMIC && actionId === 'overlay') {
					preset.feedbacks.push({
						feedbackId: 'overlay_active',
						options: {
							overlayIndex: func.name,
						},
					})
				}

				presets[presetId] = preset
			}
		} else if (config.property) {
			// 单功能 Action：如果设备不支持该 property，跳过
			if (supported && !supported.has(config.property)) continue
			const icon = loadIcon(config.icon)
			const presetId = actionId

			const preset = {
				type: 'button',
				category: config.category,
				name: config.category,
				style: {
					text: config.category,
					size: 'auto',
					color: COLOR_WHITE,
					bgcolor: COLOR_OFF,
				},
				steps: [
					{
						down: [
							{
								actionId: actionId,
								options: {},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}

			if (icon) {
				preset.style.png64 = icon
				preset.style.text = ''
			}

			if (config.hasState) {
				preset.feedbacks.push({
					feedbackId: `${actionId}_state`,
					options: {},
					style: {
						bgcolor: COLOR_ON,
						color: COLOR_WHITE,
					},
				})

				const iconOn = loadIcon(config.iconOn)
				if (iconOn) {
					preset.feedbacks[0].style.png64 = iconOn
					preset.feedbacks[0].style.text = ''
				}
			}

			presets[presetId] = preset
		}
	}

	self.setPresetDefinitions(presets)
}
