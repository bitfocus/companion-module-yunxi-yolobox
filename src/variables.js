/**
 * YoloBox Companion Module - Variable Definitions
 * 设备状态变量，可在 Companion 按钮文本中引用
 */

import { ActionRegistry, PropertyToActionMap } from './constants.js'

/**
 * 注册所有变量到 Companion 实例
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupVariables(self) {
	const variables = [
		// 连接状态
		{ variableId: 'connection_state', name: 'Connection State' },
		{ variableId: 'device_ip', name: 'Device IP' },
	]

	// 为所有有状态的 property 创建变量
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
 * 更新连接相关变量
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
 * 根据设备状态推送更新对应变量
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 * @param {string} property
 * @param {any} value
 */
export function updateStateVariable(self, property, value) {
	const varId = property.replace(/[^a-zA-Z0-9_]/g, '_')
	self.setVariableValues({ [varId]: String(value) })
}
