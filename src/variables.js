/**
 * YoloBox Companion Module - Variable Definitions
 * Device state variables that can be referenced in Companion button text
 */

import { ActionRegistry, PropertyToActionMap } from './constants.js'

/**
 * Register all variables with the Companion instance
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupVariables(self) {
	const variables = [
		// Connection state
		{ variableId: 'connection_state', name: 'Connection State' },
		{ variableId: 'device_ip', name: 'Device IP' },
	]

	// Create a variable for every stateful property
	for (const [property, mapping] of Object.entries(PropertyToActionMap)) {
		const config = ActionRegistry[mapping.actionId]
		const func = config?.functions?.find((f) => f.name === mapping.functionName)
		const label = func?.description || property

		variables.push({
			variableId: property.replace(/[^a-zA-Z0-9_]/g, '_'),
			name: `${label} State`,
		})
	}

	self.setVariableDefinitions(variables)
}

/**
 * Update connection-related variables
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 * @param {boolean} connected
 */
export function updateConnectionVariables(self, connected) {
	self.setVariableValues({
		connection_state: connected ? 'Connected' : 'Disconnected',
		device_ip: self.config?.host || '',
	})
}

/**
 * Push an update to the corresponding variable based on device state
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 * @param {string} property
 * @param {any} value
 */
export function updateStateVariable(self, property, value) {
	const varId = property.replace(/[^a-zA-Z0-9_]/g, '_')
	self.setVariableValues({ [varId]: String(value) })
}
