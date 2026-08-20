# tw-scripts

Tribal Wars scripts by **Vanquished**. Licensed under [GPL-3.0](LICENSE).

All scripts are plain quickbar scripts — no userscript manager needed. Each one below comes with a ready-made quickbar entry that loads the latest version straight from this repository: create a new quickbar item in the game (Settings → Quickbar → Add link) and paste the snippet as its target.

> The snippets load through [jsDelivr](https://www.jsdelivr.com/), which serves this repo's files with a JavaScript MIME type. Plain `raw.githubusercontent.com` links will **not** execute in-game (GitHub serves them as `text/plain` with `nosniff`, so the browser refuses to run them).

## Approved Scripts

These scripts are officially approved and available in the Tribal Wars **Script Library**. If one is missing from your local server's library, ask your server's support team to add it. Alternatively, you can load any of them directly from this repository with the quickbar snippets below.

### incomingOrders

Paste a list of target coordinates and export every command your account can see heading to those villages — your own plus your tribe's.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved%20Scripts/incomingOrders.js")
```

### renameVillages

Mass village renamer. Build names from ordered segments (fixed text, auto-incrementing number, distance from a coordinate, nearest cluster name) with overwrite/prepend/append modes. Run it on the combined village overview.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved%20Scripts/renameVillages.js")
```

### supportSender

Mass support sender (custom version of Costache Madalin's Support Sender): send support to a list of targets, including full support-plan imports.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved%20Scripts/supportSender.js")
```

### tribeInfov3

Tribe info exporter (v3 of lodi94's Download Tribe Info): export tribe members' troops, defenses and building levels as `.txt` and `.json`.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved%20Scripts/tribeInfov3.js")
```

### villageSupports

Paste a list of village coordinates and export every support stationed in those villages that your account can see.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Approved%20Scripts/villageSupports.js")
```

## Pending Scripts

These scripts have been **submitted for review but are not officially approved yet**. You can already load them with the snippets below — **at your own risk** — until they are approved and reach the Script Library.

### fakeWindowPlanner

*Submitted for review: 2026-08-20*

Fake planner for the Rally Point: paste a target list and an arrival time window, and each run picks a random target whose attack (sent now, at your fake template's slowest-unit speed) lands inside the window, then fills the target and units for you. Configurable units, English/Spanish UI, settings saved per world.

```
javascript:$.getScript("https://cdn.jsdelivr.net/gh/tw-vanquished/tw-scripts@main/Pending%20Scripts/fakeWindowPlanner.js")
```
