const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariableDefinitions = require('./variables')

class ModuleInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
	}

	async init(config) {
		this.config = config

		// Initialize actions, feedbacks, and variables
		this.updateFeedbacks()
		this.updateVariableDefinitions()

		// Start the connection polling
		this.initPolling()
	}

	// When module gets deleted
	async destroy() {
		this.stopPolling()
		this.log('debug', 'destroy')
	}

	async configUpdated(config) {
		this.config = config
		this.initPolling() // Restart polling with new settings
	}

	// Return config fields for web config
	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module uses Transport API in disguise to pull notes from all the tracks in the project.',
        	},
			{
				type: 'textinput',
				id: 'host',
				label: 'Target IP',
				width: 8,
				default: '192.168.0.10',
				regex: Regex.IP,
			},
			{
				type: 'number',
				id: 'port',
				label: 'Target Port',
				width: 4,
				default: 80,
				min: 1,
				max: 65535,
			},
			{
				type: 'number',
				id: 'interval',
				label: 'Update Interval (ms)',
				width: 12,
				default: 5000,
				min: 100,
				max: 60000,
			},
		]
	}

	initPolling() {
		this.stopPolling()

		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing IP')
			return
		}

		// Initial check immediately
		this.checkConnection()

		// Setup Interval based on config
		this.pollTimer = setInterval(() => {
			this.checkConnection()
		}, this.config.interval || 5000)
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			delete this.pollTimer
		}
	}

	async checkConnection() {
		const baseUrl = `http://${this.config.host}:${this.config.port}/api/session/transport`
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 5000)

		try {
			// 1. Get the list of tracks
			const trackRes = await fetch(`${baseUrl}/tracks`, { signal: controller.signal })
			if (!trackRes.ok) throw new Error(`HTTP ${trackRes.status}`)
			
			const trackData = await trackRes.json()
			const tracks = trackData.result || []

			let trackNotesMap = {}

			// 2. Loop through each track to get its specific annotations
			// 2. Loop through each track to get its specific annotations
			for (const track of tracks) {
				try {
					const noteRes = await fetch(`${baseUrl}/annotations?uid=${track.uid}`, { 
						signal: controller.signal 
					})
					
					if (noteRes.ok) {
						const noteData = await noteRes.json()
						const annotations = noteData.result?.annotations || {}
						const tags = annotations.tags || []
						const notesArray = annotations.notes || []

						// Create a lookup map for notes: { "15": "test 1", "30": "test 2" }
						const notesLookup = {}
						notesArray.forEach(note => {
							if (note.time !== undefined) {
								notesLookup[note.time] = note.text || ""
							}
						})

						// Build an object for this track: { "CUE 2.1": "test 1", "CUE 2.2": "test 2" }
						let trackCues = {}
						
						tags.forEach(tag => {
							if (tag.type === 'CUE') {
								const cueName = `CUE ${tag.value}`
								// Find the note text that matches this tag's time
								const noteText = notesLookup[tag.time] || ""
								trackCues[cueName] = noteText
							}
						})

						trackNotesMap[track.name] = trackCues
					} else {
						trackNotesMap[track.name] = {}
					}
				} catch (e) {
					this.log('debug', `Error processing track ${track.name}: ${e.message}`)
					trackNotesMap[track.name] = {}
				}
			}

			// 4. Update the Companion variable
			this.setVariableValues({
				track_notes: JSON.stringify(trackNotesMap)
			})

			this.checkFeedbacks('cue_text_to_button')

			if (this.lastStatus !== InstanceStatus.Ok) {
				this.updateStatus(InstanceStatus.Ok)
				this.lastStatus = InstanceStatus.Ok
			}

		} catch (error) {
			if (this.lastStatus !== InstanceStatus.Disconnected) {
				this.updateStatus(InstanceStatus.Disconnected, 'Data Fetch Error')
				this.log('error', `Update failed: ${error.message}`)
				this.lastStatus = InstanceStatus.Disconnected
			}
		} finally {
			clearTimeout(timeoutId)
		}
	}

	updateFeedbacks() {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions() {
		UpdateVariableDefinitions(this)
	}
}

runEntrypoint(ModuleInstance, [])