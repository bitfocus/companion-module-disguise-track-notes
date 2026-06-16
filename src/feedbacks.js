const { combineRgb } = require('@companion-module/base')

module.exports = function (self) {
	self.setFeedbackDefinitions({
		cue_text_to_button: {
			type: 'advanced',
			name: 'Update Button Text from Track Note',
			description: 'Sets the button text to the note for a given track. Use a CUE name (e.g. CUE 2.1) or a timecode (e.g. 00:00:01:15) as the Note Position.',
			options: [
				{
					type: 'textinput',
					id: 'track',
					label: 'Track Name',
					default: 'track 1',
				},
				{
					type: 'textinput',
					id: 'cue',
					label: 'Note Position (e.g. CUE 2.1 or 00:00:01:15)',
					default: 'CUE 1',
				},
			],
			callback: async (feedback) => {
				// Retrieve the current value of the track_notes variable
				const trackNotesRaw = await self.getVariableValue('track_notes')
				
				if (trackNotesRaw) {
					try {
						const trackNotes = JSON.parse(trackNotesRaw)
						const track = feedback.options.track
						const cue = feedback.options.cue

						// Access the specific note: trackNotes['track 1']['CUE 2.1']
						if (trackNotes[track] && trackNotes[track][cue] !== undefined) {
							return {
								text: trackNotes[track][cue]
							}
						}
					} catch (e) {
						self.log('error', `Feedback JSON parse error: ${e.message}`)
					}
				}
				
				// Return nothing (keep original text) if track/cue not found
				return {}
			},
		},
	})
}