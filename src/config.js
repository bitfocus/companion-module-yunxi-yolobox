/**
 * YoloBox Companion Module - Configuration Fields
 * Defines the Companion configuration panel
 */

import { DEFAULT_PORT } from './constants.js'

/**
 * Returns the Companion configuration panel fields
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
			value:
				'Make sure your YoloBox and Companion are on the same network. The device WebSocket server runs on port 8889 by default.',
		},
	]
}
