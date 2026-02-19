const { combineRgb } = require('@companion-module/base')

module.exports = function (self) {
	self.setFeedbackDefinitions({
		cue_text_to_button: {
			type: 'advanced',
			name: 'Update Button Text with Cue Note',
			description: 'Sets the button text to the note found in the track_notes JSON',
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
					label: 'Cue Name (e.g. CUE 2.1)',
					default: 'CUE 1.0',
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