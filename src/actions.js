/**
 * YoloBox Companion Module - Action Definitions
 * 基于 ActionRegistry 生成 Companion actions
 */

import { ActionRegistry, ActionTypes } from './constants.js'

/**
 * 为多功能 Action 生成下拉选项（仅保留设备支持的 function）
 */
function buildFunctionChoices(config, supported) {
	if (!config.functions || config.functions.length === 0) return []
	const funcs = supported
		? config.functions.filter((f) => supported.has(f.property))
		: config.functions
	return funcs.map((f) => ({ id: f.name, label: f.description }))
}

/**
 * 注册所有 actions 到 Companion 实例
 * 如果 self.supportedProperties 已设置，则仅注册设备支持的 Action
 * @param {import('./index.js').YunxiYoloBoxInstance} self
 */
export function setupActions(self) {
	const actions = {}
	const supported = self.supportedProperties // null = 全部显示

	for (const [actionId, config] of Object.entries(ActionRegistry)) {
		if (config.functions && config.functions.length > 0) {
			const choices = buildFunctionChoices(config, supported)
			// 如果过滤后没有可用 function，跳过整个 Action
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
			// 单功能 Action：如果设备不支持该 property，跳过
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
 * 处理多功能 Action 的按键回调
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
			// 非 toggle 按键：当前状态为 0 时才发送
			const currentState = self.deviceStates[property] ?? 0
			if (currentState !== 0) {
				self.log('debug', `Non-toggle button disabled, current state: ${currentState}`)
				return
			}
			value = func.value ?? 0
		} else {
			// Toggle：取反
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
		// COMMAND / MODE / DYNAMIC 等：使用 func 配置的 value
		value = func.value !== undefined ? func.value : 0
	}

	const description = func.description || func.name
	const result = await self.wsClient.sendAction(property, value, group, description)

	if (result.success) {
		self.log('debug', `Action OK: ${property} = ${value}`)
		// 乐观更新本地状态
		self.updateDeviceState(property, value)
	} else {
		self.log('warn', `Action failed: ${property} - ${result.error}`)
	}
}

/**
 * 处理单功能 Action 的按键回调
 */
async function handleSingleFunctionAction(self, actionId, config, event) {
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
