/**
 * YoloBox Companion Module - Preset Definitions
 * Preset button configurations that users can drag directly onto buttons from the Companion panel.
 */

import { combineRgb } from '@companion-module/base'
import { ActionRegistry, ActionTypes } from './constants.js'
import ICONS from './icons.generated.js'

const COLOR_OFF = combineRgb(0, 0, 0)
const COLOR_ON = combineRgb(0, 200, 0)
const COLOR_WHITE = combineRgb(255, 255, 255)

/**
 * Returns the icon's base64 data URL, or undefined if the icon is not included.
 * Icons are inlined into icons.generated.js at build time by scripts/generate-icons.mjs,
 * so the file system is not read at runtime, avoiding reliance on import.meta.url that webpack
 * statically rewrites into an absolute path.
 */
function loadIcon(iconName) {
	if (!iconName) return undefined
	return ICONS[iconName]
}

/**
 * Registers all presets with the Companion instance.
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupPresets(self) {
	const presets = {}
	const supported = self.supportedProperties // null = show all

	for (const [actionId, config] of Object.entries(ActionRegistry)) {
		if (config.functions && config.functions.length > 0) {
			// Create a preset for each function
			for (const func of config.functions) {
				// Skip if the device does not support this property
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

				// Set the icon
				if (icon) {
					preset.style.png64 = icon
					preset.style.text = ''
				}

				// If it is a stateful Boolean type, add a feedback
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

					// If there is an iconOn, use it in the feedback
					const iconOn = loadIcon(func.iconOn)
					if (iconOn) {
						preset.feedbacks[0].style.png64 = iconOn
						preset.feedbacks[0].style.text = ''
					}
				}

				// Source type: add a special feedback
				if (func.actionType === ActionTypes.DYNAMIC && actionId === 'source') {
					preset.feedbacks.push({
						feedbackId: 'source_active',
						options: {
							sourceIndex: func.name,
						},
					})
				}

				// Overlay type: add a special feedback
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
			// Single-function Action: skip if the device does not support this property
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
