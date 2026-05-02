# Disguise Track Notes

A Bitfocus Companion module that pulls track notes from a disguise project via the Transport API and makes them available as a variable for use on buttons.

## Configuration

| Field           | Default       | Description                                 |
|-----------------|---------------|---------------------------------------------|
| Target IP       | 192.168.0.10  | IP address of the disguise machine          |
| Target Port     | 80            | HTTP port of the disguise API               |
| Update Interval | 5000ms        | How often to poll for changes (100-60000ms) |

## Variable

`$(disguise-track-notes:track_notes)` - a JSON object of all tracks and their notes, structured as:

```json
{
  "track 1": {
    "CUE 2.1": "note text",
    "00:00:01:15": "another note"
  }
}
```

Notes that sit on a CUE marker use the CUE name as the key. All other notes use a `HH:MM:SS:FF` timecode as the key.

## Usage

### Option 1 - Feedback on a button

Add the **Update Button Text from Track Note** feedback to a button. Set the Track Name and Note Position to either a CUE name (e.g. `CUE 2.1`) or a timecode (e.g. `00:00:01:15`). The button text will update automatically on each poll.

### Option 2 - JSONPath expression

Use Companion's built-in `jsonpath()` expression to read a specific note anywhere a dynamic value is accepted:

```
jsonpath($(disguise-track-notes:track_notes), "$.['track 1']['CUE 2.1']")
jsonpath($(disguise-track-notes:track_notes), "$.['track 1']['00:00:01:15']")
```
