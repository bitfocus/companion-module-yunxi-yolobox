/**
 * YoloBox Companion Module - Main Entry Point
 * 继承 InstanceBase，整合 WebSocket 通信、actions、feedbacks、presets、variables
 */

import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import { getConfigFields } from './config.js'
import { setupActions } from './actions.js'
import { setupFeedbacks } from './feedbacks.js'
import { setupPresets } from './presets.js'
import { setupVariables, updateConnectionVariables, updateStateVariable } from './variables.js'
import { YunxiWebSocketClient } from './websocket-client.js'
import { PropertyToActionMap, DEFAULT_PORT } from './constants.js'

export class YunxiYoloBoxInstance extends InstanceBase {
	/**
	 * 设备状态缓存 — property → value
	 * @type {Record<string, number>}
	 */
	deviceStates = {}

	/**
	 * 设备支持的 property 集合（从 /specification 获取）
	 * null 表示尚未查询，此时不做过滤（显示所有 Action）
	 * @type {Set<string> | null}
	 */
	supportedProperties = null

	/** @type {YunxiWebSocketClient | null} */
	wsClient = null

	async init(config) {
		this.config = config
		this.deviceStates = {}
		this.supportedProperties = null

		this.wsClient = new YunxiWebSocketClient(this)

		// 设备状态推送回调
		this.wsClient.onStateUpdate = (property, value, group, description) => {
			this.updateDeviceState(property, value)
		}

		// 连接状态变化回调
		this.wsClient.onConnectionChange = async (connected) => {
			this.updateStatus(
				connected ? InstanceStatus.Ok : InstanceStatus.Disconnected,
				connected ? 'Connected' : 'Disconnected'
			)
			updateConnectionVariables(this, connected)
			if (connected) {
				this.log('info', 'Device connected, querying specification...')
				await this._fetchAndApplySpecification()
			}
		}

		// 先用全量 Action 注册（设备连接后会根据 specification 过滤）
		setupActions(this)
		setupFeedbacks(this)
		setupPresets(this)
		setupVariables(this)

		// 初始变量
		updateConnectionVariables(this, false)

		// 如果已有配置，立即连接
		if (config.host) {
			this.updateStatus(InstanceStatus.Connecting)
			this.wsClient.connect(config.host, config.port || DEFAULT_PORT)
		} else {
			this.updateStatus(InstanceStatus.BadConfig, 'No device IP configured')
		}
	}

	/**
	 * 配置变更时调用
	 */
	async configUpdated(config) {
		const hostChanged = this.config.host !== config.host
		const portChanged = this.config.port !== config.port

		this.config = config

		if (!config.host) {
			this.wsClient?.disconnect()
			this.updateStatus(InstanceStatus.BadConfig, 'No device IP configured')
			return
		}

		if (hostChanged || portChanged) {
			this.log('info', `Config updated, reconnecting to ${config.host}:${config.port || DEFAULT_PORT}`)
			this.updateStatus(InstanceStatus.Connecting)
			this.wsClient?.connect(config.host, config.port || DEFAULT_PORT)
		}
	}

	/**
	 * 模块销毁
	 */
	async destroy() {
		this.log('info', 'Module destroying')
		this.wsClient?.disconnect()
		this.wsClient = null
		this.deviceStates = {}
	}

	/**
	 * 返回配置字段
	 */
	getConfigFields() {
		return getConfigFields()
	}

	/**
	 * 更新设备状态并触发 feedback 刷新 + 变量更新
	 * @param {string} property - 设备属性标识
	 * @param {number} value - 新值
	 */
	updateDeviceState(property, value) {
		const prevValue = this.deviceStates[property]
		this.deviceStates[property] = value

		if (prevValue !== value) {
			this.log('debug', `State changed: ${property} ${prevValue} -> ${value}`)

			// 更新变量
			updateStateVariable(this, property, value)

			// 触发所有 feedback 重新检查
			this.checkFeedbacks()
		}
	}

	/**
	 * 查询设备 specification 并重新注册过滤后的 actions/presets
	 */
	async _fetchAndApplySpecification() {
		const spec = await this.wsClient.fetchSpecification()
		if (!spec || !spec.actions) {
			this.log('info', 'No specification available, using all actions')
			this.supportedProperties = null
			return
		}

		// 收集设备支持的 property 集合
		this.supportedProperties = new Set(spec.actions.map((a) => a.property))
		this.log('info', `Device supports ${this.supportedProperties.size} properties`)

		// 用过滤后的数据重新注册 actions/feedbacks/presets
		setupActions(this)
		setupFeedbacks(this)
		setupPresets(this)
	}
}

// Companion 入口
runEntrypoint(YunxiYoloBoxInstance, [])
