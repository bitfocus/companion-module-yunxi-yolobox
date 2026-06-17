/**
 * YoloBox Companion Module - Feedback Definitions
 * Button state feedback: change button appearance based on device state
 */

import { combineRgb } from '@companion-module/base'
import { ActionRegistry, ActionTypes, PropertyToActionMap } from './constants.js'

const COLOR_ON = combineRgb(0, 200, 0) // green - on/selected
const COLOR_LIVE = combineRgb(200, 0, 0) // red - live/recording
const COLOR_PREVIEW = combineRgb(0, 128, 255) // blue - preview
const COLOR_WHITE = combineRgb(255, 255, 255)

/**
 * Register all feedbacks to the Companion instance
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupFeedbacks(self) {
	const feedbacks = {}

	// Create a feedback for each stateful property in PropertyToActionMap
	// Grouped by actionId, one feedback per action

	for (const [actionId, config] of Object.entries(ActionRegistry)) {
		if (!config.hasState) continue

		if (config.functions && config.functions.length > 0) {
			// feedback for a multi-function Action
			feedbacks[`${actionId}_state`] = {
				type: 'boolean',
				name: `${config.category} State`,
				description: `Change button style when ${config.category} state changes`,
				options: [
					{
						type: 'dropdown',
						id: 'selectedFunction',
						label: 'Function',
						default: config.defaultFunction,
						choices: config.functions
							.filter((f) => f.actionType === ActionTypes.BOOLEAN || f.actionType === ActionTypes.DYNAMIC)
							.map((f) => ({ id: f.name, label: f.description })),
					},
				],
				defaultStyle: {
					bgcolor: COLOR_ON,
					color: COLOR_WHITE,
				},
				callback: (feedback) => {
					const selectedFunctionName = feedback.options.selectedFunction || config.defaultFunction
					const func = config.functions.find((f) => f.name === selectedFunctionName)
					if (!func) return false

					const currentValue = self.deviceStates[func.property]
					if (currentValue === undefined) return false

					if (func.actionType === ActionTypes.BOOLEAN) {
						return currentValue === 1
					} else if (func.actionType === ActionTypes.DYNAMIC) {
						return currentValue === 1
					}
					return false
				},
			}
		} else if (config.property) {
			// feedback for a single-function Action
			feedbacks[`${actionId}_state`] = {
				type: 'boolean',
				name: `${config.category} State`,
				description: `Change button style when ${config.category} is active`,
				options: [],
				defaultStyle: {
					bgcolor: COLOR_ON,
					color: COLOR_WHITE,
				},
				callback: () => {
					const currentValue = self.deviceStates[config.property]
					return currentValue === 1
				},
			}
		}
	}

	// Additionally add a special Source feedback (supports 4 states)
	feedbacks['source_active'] = {
		type: 'advanced',
		name: 'Video Source Active State',
		description: 'Change button style based on video source state (unselected/selected/preview/multi)',
		options: [
			{
				type: 'dropdown',
				id: 'sourceIndex',
				label: 'Source',
				default: 'source1',
				choices: ActionRegistry.source.functions.map((f) => ({
					id: f.name,
					label: f.description,
				})),
			},
		],
		callback: (feedback) => {
			const func = ActionRegistry.source.functions.find((f) => f.name === feedback.options.sourceIndex)
			if (!func) return {}

			const currentValue = self.deviceStates[func.property]

			switch (currentValue) {
				case 1: // selected (program)
					return { bgcolor: COLOR_LIVE, color: COLOR_WHITE }
				case 2: // preview
					return { bgcolor: COLOR_PREVIEW, color: COLOR_WHITE }
				case 3: // multi-selected
					return { bgcolor: COLOR_ON, color: COLOR_WHITE }
				default: // unselected
					return {}
			}
		},
	}

	// special Overlay feedback
	feedbacks['overlay_active'] = {
		type: 'advanced',
		name: 'Overlay Active State',
		description: 'Change button style when overlay is on program',
		options: [
			{
				type: 'dropdown',
				id: 'overlayIndex',
				label: 'Overlay',
				default: 'overlay1',
				choices: ActionRegistry.overlay.functions.map((f) => ({
					id: f.name,
					label: f.description,
				})),
			},
		],
		callback: (feedback) => {
			const func = ActionRegistry.overlay.functions.find((f) => f.name === feedback.options.overlayIndex)
			if (!func) return {}

			const currentValue = self.deviceStates[func.property]
			if (currentValue === 1) {
				return { bgcolor: COLOR_ON, color: COLOR_WHITE }
			}
			return {}
		},
	}

	// feedback for the Cycle type
	feedbacks['cycle_state'] = {
		type: 'advanced',
		name: 'Cycle Value State',
		description: 'Show current cycle value as button text',
		options: [
			{
				type: 'dropdown',
				id: 'property',
				label: 'Property',
				default: 'pgm_toggle',
				choices: Object.entries(PropertyToActionMap)
					.filter(([_, mapping]) => mapping.type === 'cycle')
					.map(([prop, mapping]) => {
						const config = ActionRegistry[mapping.actionId]
						const func = config?.functions?.find((f) => f.name === mapping.functionName)
						return { id: prop, label: func?.description || prop }
					}),
			},
		],
		callback: (feedback) => {
			const property = feedback.options.property
			const currentValue = self.deviceStates[property]
			if (currentValue !== undefined && currentValue > 0) {
				return { bgcolor: COLOR_ON, color: COLOR_WHITE }
			}
			return {}
		},
	}

	self.setFeedbackDefinitions(feedbacks)
}
