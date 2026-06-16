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

		this.lastStatus = null
		this.updateStatus(InstanceStatus.Connecting)
		this.log('info', `Connecting to ${this.config.host}:${this.config.port}`)

		this.checkConnection()

		this.pollTimer = setInterval(() => {
			this.checkConnection()
		}, this.config.interval || 5000)
	}

	async fetchProjectFps(signal) {
		const url = `http://${this.config.host}:${this.config.port}/api/session/python/execute`
		// Network errors are NOT caught here — they propagate to checkConnection()'s
		// catch block so the status is correctly set to Disconnected.
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ script: 'return(state.globalRefreshRate)' }),
			signal,
		})
		if (!res.ok) return 25
		try {
			const data = await res.json()
			const refreshRate = JSON.parse(data.returnValue).asDouble
			return refreshRate <= 30 ? refreshRate : refreshRate / 2
		} catch {
			return 25
		}
	}

	secondsToTimecode(seconds, fps) {
		const totalFrames = Math.round(seconds * fps)
		const frames = totalFrames % fps
		const totalSecs = Math.floor(totalFrames / fps)
		const secs = totalSecs % 60
		const mins = Math.floor(totalSecs / 60) % 60
		const hours = Math.floor(totalSecs / 3600)
		const pad = (n) => String(Math.floor(n)).padStart(2, '0')
		return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			delete this.pollTimer
		}
		if (this.activeController) {
			this.activeController.abort('config_change')
			delete this.activeController
		}
	}

	async checkConnection() {
		if (this.activeController) this.activeController.abort('superseded')

		const controller = new AbortController()
		this.activeController = controller
		const timeoutId = setTimeout(() => controller.abort('timeout'), 5000)

		try {
			this.projectFps = await this.fetchProjectFps(controller.signal)

			const baseUrl = `http://${this.config.host}:${this.config.port}/api/session/transport`

			const trackRes = await fetch(`${baseUrl}/tracks`, { signal: controller.signal })
			if (!trackRes.ok) throw new Error(`HTTP ${trackRes.status}`)

			const trackData = await trackRes.json()
			const tracks = trackData.result || []

			let trackNotesMap = {}

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

						// Create a lookup map for notes: { 15: "note 1", 20: "note 2" }
						const notesLookup = {}
						notesArray.forEach(note => {
							if (note.time !== undefined) {
								notesLookup[note.time] = note.text || ""
							}
						})

						let trackCues = {}
						const matchedTimes = new Set()

						// CUE-matched notes use "CUE X" as key
						tags.forEach(tag => {
							if (tag.type === 'CUE') {
								const cueName = `CUE ${tag.value}`
								trackCues[cueName] = notesLookup[tag.time] || ""
								matchedTimes.add(tag.time)
							}
						})

						// Remaining notes use "HH:MM:SS:FF" timecode as key
						notesArray.forEach(note => {
							if (note.time !== undefined && !matchedTimes.has(note.time)) {
								const tc = this.secondsToTimecode(note.time, this.projectFps)
								trackCues[tc] = note.text || ""
							}
						})

						trackNotesMap[track.name] = trackCues
					} else {
						trackNotesMap[track.name] = {}
					}
				} catch (e) {
					if (e.name === 'AbortError') throw e
					this.log('debug', `Error processing track ${track.name}: ${e.message}`)
					trackNotesMap[track.name] = {}
				}
			}

			this.setVariableValues({
				track_notes: JSON.stringify(trackNotesMap)
			})

			this.checkFeedbacks('cue_text_to_button')

			if (this.lastStatus !== InstanceStatus.Ok) {
				this.updateStatus(InstanceStatus.Ok)
				this.lastStatus = InstanceStatus.Ok
				this.log('info', `Connected to ${this.config.host}:${this.config.port}`)
			}

		} catch (error) {
			const reason = controller.signal.reason
			if (reason === 'config_change' || reason === 'superseded') return

			const msg = reason === 'timeout' ? 'Connection timeout' : error.message
			if (this.lastStatus !== InstanceStatus.Disconnected) {
				this.updateStatus(InstanceStatus.Disconnected, msg)
				this.lastStatus = InstanceStatus.Disconnected
				this.log('warn', `Disconnected from ${this.config.host}:${this.config.port}: ${msg}`)
			}
		} finally {
			clearTimeout(timeoutId)
			if (this.activeController === controller) delete this.activeController
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