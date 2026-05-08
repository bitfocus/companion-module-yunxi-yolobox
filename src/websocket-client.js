/**
 * YoloBox Companion Module - WebSocket Client
 * 复用自 StreamDeck 插件，适配 Node.js ws 库 + Companion 日志
 */

import WebSocket from 'ws'
import { DEFAULT_PORT, CONNECTION_TIMEOUT, RECONNECT_INTERVAL, WebSocketEndpoints } from './constants.js'

export const ConnectionState = {
	DISCONNECTED: 'disconnected',
	CONNECTING: 'connecting',
	CONNECTED: 'connected',
	RECONNECTING: 'reconnecting',
	ERROR: 'error',
}

export class YunxiWebSocketClient {
	/**
	 * @param {import('@companion-module/base').InstanceBase} instance - Companion 模块实例，用于日志
	 */
	constructor(instance) {
		this.instance = instance
		this.subscriberSocket = null
		this.actionSocket = null
		this.heartbeatSocket = null
		this.host = null
		this.port = DEFAULT_PORT
		this.isConnected = false
		this.connectionState = ConnectionState.DISCONNECTED
		this.probeTimer = null
		this.pendingRequests = new Map()
		this.orderIdCounter = 0

		/** @type {((property: string, value: any, group: string, description: string) => void) | null} */
		this.onStateUpdate = null
		/** @type {((connected: boolean) => void) | null} */
		this.onConnectionChange = null
	}

	/**
	 * 连接到 YoloBox 设备
	 */
	connect(host, port = DEFAULT_PORT) {
		if (this.isConnected && this.host === host && this.port === port) {
			this.instance.log('debug', `Already connected to ${host}`)
			return
		}

		this.disconnect()
		this.host = host
		this.port = port

		this.instance.log('info', `Connecting to ${host}:${port}`)
		this._setConnectionState(ConnectionState.CONNECTING)

		try {
			const subscriberUrl = `ws://${host}:${port}/${WebSocketEndpoints.SUBSCRIBER}`
			this.subscriberSocket = new WebSocket(subscriberUrl)

			this.subscriberSocket.on('open', () => this._onOpen())
			this.subscriberSocket.on('message', (data) => this._onMessage(data))
			this.subscriberSocket.on('error', (error) => this._onError(error))
			this.subscriberSocket.on('close', (code, reason) => this._onClose(code, reason))

			setTimeout(() => {
				if (!this.isConnected) {
					this.instance.log('warn', 'Connection timeout')
					this.subscriberSocket?.close()
				}
			}, CONNECTION_TIMEOUT)
		} catch (error) {
			this.instance.log('error', `Connection error: ${error.message}`)
			this._startProbing()
		}
	}

	/**
	 * 断开所有连接
	 */
	disconnect() {
		this._clearTimers()

		if (this.subscriberSocket) {
			this.subscriberSocket.removeAllListeners()
			this.subscriberSocket.close()
			this.subscriberSocket = null
		}

		if (this.heartbeatSocket) {
			this.heartbeatSocket.removeAllListeners()
			this.heartbeatSocket.close()
			this.heartbeatSocket = null
		}

		if (this.actionSocket) {
			this.actionSocket.removeAllListeners()
			this.actionSocket.close()
			this.actionSocket = null
		}

		this.isConnected = false
		this._setConnectionState(ConnectionState.DISCONNECTED)
		this.pendingRequests.clear()
	}

	/**
	 * 发送 Action 命令到设备
	 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
	 */
	sendAction(property, value, group = '', description = '') {
		if (!this.host) {
			return Promise.reject(new Error('No host configured'))
		}

		const message = {
			description: description || property,
			group: group || '',
			property,
			value,
		}

		this.instance.log('debug', `Sending action: ${JSON.stringify(message)}`)

		return new Promise((resolve) => {
			this._ensureActionSocket()
				.then(() => {
					const orderId = ++this.orderIdCounter

					const timeout = setTimeout(() => {
						this.pendingRequests.delete(orderId)
						this.instance.log('warn', 'Action response timeout')
						resolve({ success: false, error: 'Response timeout' })
					}, 3000)

					this.pendingRequests.set(orderId, { resolve, timeout, message })

					try {
						this.actionSocket.send(JSON.stringify(message))
					} catch (error) {
						clearTimeout(timeout)
						this.pendingRequests.delete(orderId)
						this.instance.log('error', `Send action error: ${error.message}`)
						resolve({ success: false, error: 'Send failed' })
					}
				})
				.catch((error) => {
					this.instance.log('error', `Action socket error: ${error.message}`)
					resolve({ success: false, error: 'Connection failed' })
				})
		})
	}

	/**
	 * 确保 Action 持久连接可用
	 */
	_ensureActionSocket() {
		return new Promise((resolve, reject) => {
			if (this.actionSocket && this.actionSocket.readyState === WebSocket.OPEN) {
				resolve()
				return
			}

			if (this.actionSocket && this.actionSocket.readyState === WebSocket.CONNECTING) {
				const checkReady = setInterval(() => {
					if (this.actionSocket.readyState === WebSocket.OPEN) {
						clearInterval(checkReady)
						resolve()
					} else if (this.actionSocket.readyState === WebSocket.CLOSED) {
						clearInterval(checkReady)
						this._createActionSocket().then(resolve).catch(reject)
					}
				}, 50)
				return
			}

			this._createActionSocket().then(resolve).catch(reject)
		})
	}

	/**
	 * 创建 Action 持久连接
	 */
	_createActionSocket() {
		return new Promise((resolve, reject) => {
			const actionUrl = `ws://${this.host}:${this.port}`
			this.instance.log('debug', `Creating action socket: ${actionUrl}`)

			this.actionSocket = new WebSocket(actionUrl)

			const connectTimeout = setTimeout(() => {
				this.instance.log('error', 'Action socket connect timeout')
				this.actionSocket?.close()
				reject(new Error('Connection timeout'))
			}, 5000)

			this.actionSocket.on('open', () => {
				clearTimeout(connectTimeout)
				this.instance.log('debug', 'Action socket opened')
				resolve()
			})

			this.actionSocket.on('message', (raw) => {
				try {
					const data = JSON.parse(raw.toString())

					if (data.response !== undefined) {
						const entries = Array.from(this.pendingRequests.entries())
						if (entries.length > 0) {
							const [orderId, request] = entries[0]
							clearTimeout(request.timeout)
							this.pendingRequests.delete(orderId)

							if (data.response === 1 && data.message === 'OK') {
								request.resolve({ success: true, data })
							} else {
								request.resolve({ success: false, data, error: data.message || 'Command failed' })
							}
						}
					} else if (data.property) {
						if (this.onStateUpdate) {
							this.onStateUpdate(data.property, data.value, data.group, data.description)
						}
					}
				} catch (e) {
					this.instance.log('warn', `Parse action response error: ${e.message}`)
				}
			})

			this.actionSocket.on('error', (error) => {
				clearTimeout(connectTimeout)
				this.instance.log('error', `Action socket error: ${error.message}`)
			})

			this.actionSocket.on('close', () => {
				this.instance.log('debug', 'Action socket closed')
				this.actionSocket = null
				setTimeout(() => {
					for (const [, request] of this.pendingRequests) {
						clearTimeout(request.timeout)
						request.resolve({ success: false, error: 'Connection closed' })
					}
					this.pendingRequests.clear()
				}, 200)
				// 预创建下一个连接
				if (this.host && this.isConnected) {
					this._createActionSocket().catch(() => {})
				}
			})
		})
	}

	// --- Subscriber Socket 事件 ---

	_onOpen() {
		this.instance.log('info', `Connected to ${this.host}`)
		this.isConnected = true
		this._clearTimers()
		this._setConnectionState(ConnectionState.CONNECTED)
		this._startHeartbeat()
	}

	_onMessage(raw) {
		try {
			const data = JSON.parse(raw.toString())

			if (data.property !== undefined && data.value !== undefined) {
				this.instance.log('debug', `State update: ${data.property} = ${data.value}`)
				if (this.onStateUpdate) {
					this.onStateUpdate(data.property, data.value, data.group, data.description)
				}
			}
		} catch (error) {
			this.instance.log('error', `Parse message error: ${error.message}`)
		}
	}

	_onError(error) {
		this.instance.log('error', `Subscriber error: ${error.message}`)
	}

	_onClose(code, reason) {
		this.instance.log('info', `Subscriber closed: ${code} ${reason}`)
		this.isConnected = false
		this._startProbing()
	}

	// --- 心跳 ---

	_startHeartbeat() {
		this._stopHeartbeat()

		const heartbeatUrl = `ws://${this.host}:${this.port}/${WebSocketEndpoints.HEARTBEAT}`
		this.instance.log('debug', `Starting heartbeat: ${heartbeatUrl}`)

		try {
			this.heartbeatSocket = new WebSocket(heartbeatUrl)

			this.heartbeatSocket.on('open', () => {
				this.instance.log('debug', 'Heartbeat connected')
			})

			this.heartbeatSocket.on('error', () => {
				this.instance.log('warn', 'Heartbeat error')
			})

			this.heartbeatSocket.on('close', () => {
				this.instance.log('debug', 'Heartbeat closed')
				if (this.isConnected) {
					this._handleConnectionLost()
				}
			})
		} catch (error) {
			this.instance.log('error', `Heartbeat error: ${error.message}`)
		}
	}

	_stopHeartbeat() {
		if (this.heartbeatSocket) {
			this.heartbeatSocket.removeAllListeners()
			this.heartbeatSocket.close()
			this.heartbeatSocket = null
		}
	}

	// --- 探测重连 ---

	_startProbing() {
		if (this.probeTimer) return

		this._setConnectionState(ConnectionState.RECONNECTING)
		this.instance.log('info', `Start probing every ${RECONNECT_INTERVAL}ms`)

		this.probeTimer = setInterval(() => {
			if (!this.host) return

			const probeUrl = `ws://${this.host}:${this.port}/${WebSocketEndpoints.TEST}`
			const probe = new WebSocket(probeUrl)

			const probeTimeout = setTimeout(() => {
				probe.removeAllListeners()
				probe.close()
			}, 3000)

			probe.on('open', () => {
				clearTimeout(probeTimeout)
				probe.close()
				this.instance.log('info', 'Probe succeeded, reconnecting...')
				this._stopProbing()
				this.connect(this.host, this.port)
			})

			probe.on('error', () => {
				clearTimeout(probeTimeout)
				probe.close()
			})
		}, RECONNECT_INTERVAL)
	}

	_stopProbing() {
		if (this.probeTimer) {
			clearInterval(this.probeTimer)
			this.probeTimer = null
		}
	}

	_clearTimers() {
		this._stopProbing()
		this._stopHeartbeat()
	}

	_handleConnectionLost() {
		this.instance.log('warn', 'Connection lost (heartbeat)')
		this._stopHeartbeat()

		if (this.subscriberSocket) {
			this.subscriberSocket.removeAllListeners()
			this.subscriberSocket.close()
			this.subscriberSocket = null
		}

		if (this.actionSocket) {
			this.actionSocket.removeAllListeners()
			this.actionSocket.close()
			this.actionSocket = null
		}

		this.isConnected = false
		this._startProbing()
	}

	_setConnectionState(state) {
		const prev = this.connectionState
		this.connectionState = state

		if (prev !== state) {
			this.instance.log('debug', `State: ${prev} -> ${state}`)
			if (this.onConnectionChange) {
				this.onConnectionChange(state === ConnectionState.CONNECTED)
			}
		}
	}

	/**
	 * 查询设备支持的 Action 列表
	 * 连接到 /specification 端点，设备返回 ActionSpecification JSON 后自动关闭
	 * @returns {Promise<object|null>}
	 */
	fetchSpecification() {
		if (!this.host) return Promise.resolve(null)

		return new Promise((resolve) => {
			const url = `ws://${this.host}:${this.port}/${WebSocketEndpoints.SPECIFICATION}`
			const ws = new WebSocket(url)

			const timeout = setTimeout(() => {
				ws.removeAllListeners()
				ws.close()
				this.instance.log('warn', 'Specification request timeout')
				resolve(null)
			}, 5000)

			ws.on('message', (raw) => {
				clearTimeout(timeout)
				try {
					const spec = JSON.parse(raw.toString())
					this.instance.log('info', `Received specification: ${spec.actions?.length ?? 0} actions`)
					resolve(spec)
				} catch (e) {
					this.instance.log('warn', `Parse specification error: ${e.message}`)
					resolve(null)
				}
			})

			ws.on('error', () => {
				clearTimeout(timeout)
				resolve(null)
			})

			ws.on('close', () => {
				clearTimeout(timeout)
			})
		})
	}

	/**
	 * 获取连接状态摘要
	 */
	getStatus() {
		return {
			isConnected: this.isConnected,
			host: this.host,
			port: this.port,
			connectionState: this.connectionState,
		}
	}
}
