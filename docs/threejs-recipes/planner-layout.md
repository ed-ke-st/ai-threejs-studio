# Planner Layout

Use this recipe for interactive planning scenes, layout tools, arrangement work, zone editing, floor grids, and object-placement workflows.

## Prompt Mapping

- layout planning scene -> floor grid + zone markers + readable overhead light
- arrangement workspace -> neutral floor plane, markers, simple editing affordances
- planner with zones -> 2-4 clear movable markers, not decorative clutter

## Required Structure

- a readable floor or floor grid
- at least two zone markers or planning markers
- top-down or slightly elevated camera logic
- neutral lighting with enough clarity for inspection work

## Planning Pattern

- category: `interactive-layout-planning`
- prioritize legibility over atmosphere
- prefer metadata-backed scenes for simple planning layouts
- keep the scene sparse and editable

## Interaction Pattern

- markers should imply movement, arrangement, or editing intent
- do not require advanced physics or drag code in the first pass
- planner prompts should preserve clean spacing between markers

## Failure Modes

- planner scene retrieves decorative room examples and becomes too atmospheric
- no visible grid or floor anchor
- markers are too small, too close together, or visually ambiguous
- warm/cinematic lighting makes arrangement work harder instead of clearer

## Retrieval Hints

Match these terms:

- planner
- layout
- zone
- marker
- arrangement
- floor grid
