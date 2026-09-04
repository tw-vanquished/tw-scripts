# tw-scripts

Tribal Wars scripts by **Vanquished**. Licensed under [GPL-3.0](LICENSE).

All scripts are plain quickbar scripts — no userscript manager needed. Each one below comes with a ready-made quickbar entry that loads the latest version straight from this repository: create a new quickbar item in the game (Settings → Quickbar → Add link) and paste the snippet as its target.

> The snippets load through [jsDelivr](https://www.jsdelivr.com/), which serves this repo's files with a JavaScript MIME type. Plain `raw.githubusercontent.com` links will **not** execute in-game (GitHub serves them as `text/plain` with `nosniff`, so the browser refuses to run them).

## Approved Scripts

These scripts are officially approved and available in the Tribal Wars **Script Library**. If one is missing from your local server's library, ask your server's support team to add it. Alternatively, you can load any of them directly from this repository with the quickbar snippets below.

### incomingOrders

Paste a list of target coordinates and export every command your account can see heading to those villages — your own plus your tribe's.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved/incomingOrders.js")
```

### renameVillages

Mass village renamer. Build names from ordered segments (fixed text, auto-incrementing number, distance from a coordinate, nearest cluster name) with overwrite/prepend/append modes. Run it on the combined village overview.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved/renameVillages.js")
```

### reportsExport

Batch battle-report exporter: on the Reports overview, select attack/defence reports and export them as a `tw-reports-*.json` file. This is **NeilB's** *ReportsToClipboard*, hotfixed by Vanquished so it works on the Spanish servers (world id from any TW domain, ES date format, localized table labels). Approved by the Tribal Wars .es support team — ticket **#20659456**.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved/reportsExport.js")
```

### supportSender

Mass support sender (custom version of Costache Madalin's Support Sender): send support to a list of targets, including full support-plan imports.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved/supportSender.js")
```

### tribeInfov3

Tribe info exporter (v3 of lodi94's Download Tribe Info): export tribe members' troops, defenses and building levels as `.txt` and `.json`.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved/tribeInfov3.js")
```

### villageSupports

Paste a list of village coordinates and export every support stationed in those villages that your account can see.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved/villageSupports.js")
```

### dynamicFakeWindow (v1.0)

Fake planner for the Rally Point: paste a target list and an arrival time window, and each run picks a target whose attack (sent now, at your fake template's slowest-unit speed) lands inside the window, then fills the target and units for you. Configurable units, English/Spanish UI, settings saved per world.

v1.0 is approved by the Tribal Wars .es support team — ticket **#20684174**. The file keeps its original path so quickbar links installed during the review keep working:

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Pending/dynamicFakeWindow.js")
```

## Pending Scripts

These scripts have been **submitted for review but are not officially approved yet**. You can already load them with the snippets below — **at your own risk** — until they are approved and reach the Script Library.

### dynamicFakeWindow v1.1

*Not yet reviewed (v1.0 above is the approved version).*

Same planner as the approved v1.0; **v1.1** adds a *Target order* setting in the panel: **Random** (as before), **Random (no repeats)** and **List order**. A target counts as used when you click *Attack*; once every eligible target has been used the cycle starts over, and editing the list (or the *Reset* button) clears the progress.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Pending/dynamicFakeWindowv1-1.js")
```

### incomingOrders v2.0

*Not yet submitted for review.* Same exporter as the approved incomingOrders, but the per-command details (origin, exact arrival, units) are read from the game's lightweight hover-preview data instead of each command's full info page, and requests run asynchronously so the tab never freezes. Same CSV/JSON output, plus `arrival_epoch_ms` in the JSON.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Pending/incomingOrdersv2.js")
```

### outgoingCommands

*Not yet submitted for review.* Run it on the tribe troop overview (Tribe → Members → Troops) to get a compact list of every member's active outgoing commands: player and command count, sortable by either column, with a link to the player's profile and a mail icon that opens a new message to them. Reads the page only, nothing is fetched. The dialog can be resized from its bottom-right corner; the size is remembered.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Pending/outgoingCommands.js")
```
