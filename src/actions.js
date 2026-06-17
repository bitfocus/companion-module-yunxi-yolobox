/**
 * YoloBox Companion Module - Action Definitions
 * Generates Companion actions based on the ActionRegistry
 */

import { ActionRegistry, ActionTypes } from './constants.js'

/**
 * Builds dropdown choices for a multi-function Action (keeps only functions supported by the device)
 */
function buildFunctionChoices(config, supported) {
	if (!config.functions || config.functions.length === 0) return []
	const funcs = supported ? config.functions.filter((f) => supported.has(f.property)) : config.functions
	return funcs.map((f) => ({ id: f.name, label: f.description }))
}

/**
 * Registers all actions to the Companion instance
 * If self.supportedProperties is set, only registers Actions supported by the device
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupActions(self) {
	const actions = {}
	const supported = self.supportedProperties // null = show all

	for (const [actionId, config] of Object.entries(ActionRegistry)) {
		if (config.functions && config.functions.length > 0) {
			const choices = buildFunctionChoices(config, supported)
			// If no function remains after filtering, skip the entire Action
			if (choices.length === 0) continue

			actions[actionId] = {
				name: config.category,
				options: [
					{
						type: 'dropdown',
						id: 'selectedFunction',
						label: 'Function',
						default: choices[0].id,
						choices,
					},
				],
				callback: async (event) => {
					await handleMultiFunctionAction(self, actionId, config, event)
				},
			}
		} else if (config.property) {
			// Single-function Action: skip if the device does not support this property
			if (supported && !supported.has(config.property)) continue

			actions[actionId] = {
				name: config.category,
				options: [],
				callback: async (event) => {
					await handleSingleFunctionAction(self, actionId, config, event)
				},
			}
		}
	}

	self.setActionDefinitions(actions)
}

/**
 * Handles the button callback for a multi-function Action
 */
async function handleMultiFunctionAction(self, actionId, config, event) {
	const selectedFunctionName = event.options.selectedFunction || config.defaultFunction
	const func = config.functions.find((f) => f.name === selectedFunctionName)

	if (!func) {
		self.log('warn', `Function not found: ${selectedFunctionName}`)
		return
	}

	const group = func.group || config.group
	const property = func.property

	if (!property) {
		self.log('warn', `No property for action: ${actionId}`)
		return
	}

	let value
	if (func.actionType === ActionTypes.BOOLEAN) {
		if (func.toggle === false) {
			// Non-toggle button: only send when the current state is 0
			const currentState = self.deviceStates[property] ?? 0
			if (currentState !== 0) {
				self.log('debug', `Non-toggle button disabled, current state: ${currentState}`)
				return
			}
			value = func.value ?? 0
		} else {
			// Toggle: invert the value
			const currentState = self.deviceStates[property] ?? 0
			value = currentState === 0 ? 1 : 0
		}
	} else if (func.actionType === ActionTypes.CYCLE) {
		const cycleValues = func.cycleValues || [0, 1]
		const currentValue = self.deviceStates[property] ?? 0
		const currentIndex = cycleValues.indexOf(currentValue)
		const nextIndex = (currentIndex + 1) % cycleValues.length
		value = cycleValues[nextIndex]
	} else {
		// COMMAND / MODE / DYNAMIC, etc.: use the value configured in func
		value = func.value !== undefined ? func.value : 0
	}

	const description = func.description || func.name
	const result = await self.wsClient.sendAction(property, value, group, description)

	if (result.success) {
		self.log('debug', `Action OK: ${property} = ${value}`)
		// Optimistically update the local state
		self.updateDeviceState(property, value)
	} else {
		self.log('warn', `Action failed: ${property} - ${result.error}`)
	}
}

/**
 * Handles the button callback for a single-function Action
 */
async function handleSingleFunctionAction(self, actionId, config, _event) {
	const property = config.property
	const group = config.group

	if (!property) {
		self.log('warn', `No property for single action: ${actionId}`)
		return
	}

	let value
	if (config.hasState && config.actionType === ActionTypes.BOOLEAN) {
		const currentState = self.deviceStates[property] ?? 0
		value = currentState === 0 ? 1 : 0
	} else {
		value = 0
	}

	const result = await self.wsClient.sendAction(property, value, group, config.category)

	if (result.success) {
		self.log('debug', `Action OK: ${property} = ${value}`)
		self.updateDeviceState(property, value)
	} else {
		self.log('warn', `Action failed: ${property} - ${result.error}`)
	}
}
