/**
 * YoloBox Companion Module - Configuration Fields
 * 定义 Companion 配置面板
 */

import { DEFAULT_PORT } from './constants.js'

/**
 * 返回 Companion 配置面板字段
 */
export function getConfigFields() {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Device IP Address',
			width: 8,
			regex: '/^(?:\\d{1,3}\\.){3}\\d{1,3}$/',
			required: true,
			tooltip: 'The IP address of your YoloBox device',
		},
		{
			type: 'number',
			id: 'port',
			label: 'WebSocket Port',
			width: 4,
			default: DEFAULT_PORT,
			min: 1,
			max: 65535,
			tooltip: 'WebSocket port (default: 8889)',
		},
		{
			type: 'static-text',
			id: 'info',
			label: 'Connection Info',
			width: 12,
			value: 'Make sure your YoloBox and Companion are on the same network. The device WebSocket server runs on port 8889 by default.',
		},
	]
}
