# Geometry Diagram Designer

Teachers draw a clean, correctly marked geometry diagram and download it as a picture for a worksheet, slide or quiz.

**Live site:** <https://jontaylormed.github.io/diagram-designer/>

**Source:** <https://github.com/jontaylormed/diagram-designer>

**Site created by Claude and Jon Taylor.**

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

---

## What it does

| Section | What the teacher does |
|---|---|
| Start With | Picks a ready figure: triangle, quadrilateral, parallel lines and a transversal, angle, circle, circle with tangent lines, or regular polygon |
| Draw | Adds points, segments, rays, lines, circles, arcs, polygons, angle marks and text labels on a grid |
| Draw From Measures | Types the measure they want, and the drawing is reshaped to match |
| Selected | Changes, marks or relabels the piece they tapped |
| Download | Saves a PNG, with options for bold lines (projector) or black and white (printing) |
| Open | Opens a downloaded picture again, ready to change |

## Who it's for

Math teachers who make their own geometry materials. Students never open it; they only see the pictures it makes. It is a teacher tool, so no student standards are listed. Its names and marks follow the companion [Geometric Interactive Notes](https://jontaylormed.github.io/geo-notes/).

## How it teaches

- **Check every claim.** When a mark or label claims something the drawing doesn't show, the designer says so in one plain sentence and labels the picture "Not drawn to scale." Examples are matching tick marks on segments of different lengths, or a right-angle box on an angle that isn't 90°.
- **Labels never mislead.** Arc marks are only for congruent angles, angles are named with three points, and nothing may cover a name.
- **Every picture comes with a description.** Download Picture copies the diagram's description to use as alt text, and stores it inside the picture.

## How the math was checked

- **Test page:** [`tests.html`](https://jontaylormed.github.io/diagram-designer/tests.html) runs 230 tests of the drawing model in the browser. They cover placing and dragging points, held points, Make This Angle, snapping, circles, arcs, angle marks, regular polygons, matching tick marks, alt text and fitting the picture to its frame. All 230 pass.
- **Build checks:** `build.ps1` fails if the tool would make a network request or store data, if any of 18 color pairs is below its contrast target, if the picture's colors drift from the checked palette, or if a button or heading is not in Title Case.
- **Known limits:** the scale check compares lengths by proportion, since a figure drawn from measures is scaled to fit. It covers the cases listed above, not every possible claim.

## Accessibility

- Its buttons, menus and fields are standard controls, so they work with the keyboard. Focus outlines are visible.
- Status messages are announced to screen readers through live regions.
- All text meets WCAG 2.1 AA contrast, and figure strokes meet 3:1, checked at every build.
- The tool has no animation.
- The alt text it writes helps teachers make their own materials accessible.
- There is no separate text-size setting; the page follows browser zoom.

## Privacy

No accounts, no tracking, no cookies and no stored data. The designer makes no network requests, and the build fails if one is added. A download is a file saved on the teacher's own device, and Open a Diagram reads only the file the teacher chooses.

## Running it

Open `index.html` in any modern browser. Open `tests.html` to run the tests.

To rebuild after changing anything in `src/`, run this in Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

**Publishing:** GitHub Pages, deployed from the `main` branch at the repository root. `index.html` is committed already built, so GitHub needs no build step.

## License

[CC BY-NC-SA 4.0](LICENSE). Free to share and adapt for non-commercial use, with credit, under the same license.
