# Disguise Notes Feedback

A Bitfocus Companion module for disguise that pulls tracks data via the Transport API.

## Features
- **Health Polling**: Automatic reconnection logic with status updates.
- **Dynamic Variables**: Pulls all track notes and cues into a single JSON variable.
- **Advanced Feedback**: Dynamically updates button text based on specific Cue notes.

## Configuration
- **Target IP**: The IP of your disguise machine (use 127.0.0.1 if local).
- **Port**: Default is 80.
- **Update Interval**: How often to poll the Session API (default 5000ms).

## Variables
- `$(disguise-feedback:track_notes)`: Returns a JSON object of all tracks and their CUE notes.