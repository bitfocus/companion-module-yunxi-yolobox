/**
 * YoloBox Companion Module - Main Entry Point
 * Extends InstanceBase, integrating WebSocket communication, actions, feedbacks, presets, and variables
 */

import { InstanceBase, InstanceStatus, runEntrypoint } from '@companion-module/base'
import { getConfigFields } from './config.js'
import { setupActions } from './actions.js'
import { setupFeedbacks } from './feedbacks.js'
import { setupPresets } from './presets.js'
import { setupVariables, updateConnectionVariables, updateStateVariable } from './variables.js'
import { YunxiWebSocketClient } from './websocket-client.js'
import { DEFAULT_PORT } from './constants.js'

export class YunxiYoloBoxInstance extends InstanceBase {
	/**
	 * Device state cache — property → value
	 * @type {Record<string, number>}
	 */
	deviceStates = {}

	/**
	 * Set of properties supported by the device (obtained from /specification)
	 * null means it has not been queried yet, in which case no filtering is applied (all Actions are shown)
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

		// Device state push callback
		this.wsClient.onStateUpdate = (property, value, _group, _description) => {
			this.updateDeviceState(property, value)
		}

		// Connection state change callback
		this.wsClient.onConnectionChange = async (connected) => {
			this.updateStatus(
				connected ? InstanceStatus.Ok : InstanceStatus.Disconnected,
				connected ? 'Connected' : 'Disconnected',
			)
			updateConnectionVariables(this, connected)
			if (connected) {
				this.log('info', 'Device connected, querying specification...')
				await this._fetchAndApplySpecification()
			}
		}

		// Register with the full set of Actions first (filtered by specification after the device connects)
		setupActions(this)
		setupFeedbacks(this)
		setupPresets(this)
		setupVariables(this)

		// Initial variables
		updateConnectionVariables(this, false)

		// If a configuration already exists, connect immediately
		if (config.host) {
			this.updateStatus(InstanceStatus.Connecting)
			this.wsClient.connect(config.host, config.port || DEFAULT_PORT)
		} else {
			this.updateStatus(InstanceStatus.BadConfig, 'No device IP configured')
		}
	}

	/**
	 * Called when the configuration changes
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
	 * Module destruction
	 */
	async destroy() {
		this.log('info', 'Module destroying')
		this.wsClient?.disconnect()
		this.wsClient = null
		this.deviceStates = {}
	}

	/**
	 * Return the configuration fields
	 */
	getConfigFields() {
		return getConfigFields()
	}

	/**
	 * Update the device state and trigger a feedback refresh + variable update
	 * @param {string} property - Device property identifier
	 * @param {number} value - New value
	 */
	updateDeviceState(property, value) {
		const prevValue = this.deviceStates[property]
		this.deviceStates[property] = value

		if (prevValue !== value) {
			this.log('debug', `State changed: ${property} ${prevValue} -> ${value}`)

			// Update variables
			updateStateVariable(this, property, value)

			// Trigger a re-check of all feedbacks
			this.checkFeedbacks()
		}
	}

	/**
	 * Query the device specification and re-register the filtered actions/presets
	 */
	async _fetchAndApplySpecification() {
		const spec = await this.wsClient.fetchSpecification()
		if (!spec || !spec.actions) {
			this.log('info', 'No specification available, using all actions')
			this.supportedProperties = null
			return
		}

		// Collect the set of properties supported by the device
		this.supportedProperties = new Set(spec.actions.map((a) => a.property))
		this.log('info', `Device supports ${this.supportedProperties.size} properties`)

		// Re-register actions/feedbacks/presets using the filtered data
		setupActions(this)
		setupFeedbacks(this)
		setupPresets(this)
	}
}

// Companion entry point
runEntrypoint(YunxiYoloBoxInstance, [])
