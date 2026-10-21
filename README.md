# Snowday

3D-Slopestyle-Snowboardspiel im Browser (Three.js). Ein 800 m langer Park mit 7 Kickern, 8 Rails und Boxes, Tricks, Grabs, Grinds und Combo-Wertung.

## Starten

Das Spiel lädt ES-Module und 3D-Modelle per `fetch`, braucht also einen lokalen Webserver:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Steuerung (Tastatur)

| Taste | Aktion |
| --- | --- |
| `W` / `↑` | Tuck (schneller), langsam anschieben |
| `S` / `↓` | Bremsen |
| `A` `D` / `←` `→` | Carven, in der Luft drehen (Spins) |
| `Leertaste` | Halten = Pop laden, loslassen = Ollie. An der Kickerkante loslassen gibt extra Höhe |
| `W` / `S` in der Luft | Frontflip / Backflip |
| `J` `K` `L` | Indy, Mute, Melon |
| `U` `I` `O` | Nosegrab, Stalefish, Tailgrab |
| `A` `D` auf dem Rail | Balance halten, `Leertaste` = Absprung |
| `W` / `S` auf dem Rail | Nose Press / Tail Press |
| `R` | Run neu starten |
| `Esc` | Pause |
| `H` | Steuerung einblenden |
| `M` | Ton an/aus |

Sauber landen heißt: Board in Fahrtrichtung (vorwärts oder switch) und aufrecht. Leicht schief gibt *Sketchy* (halbe Punkte), zu schief einen Sturz. Tricks innerhalb kurzer Zeit verketten sich zu einer Combo mit Multiplikator.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/course.js` | Strecke: analytisches Höhenfeld, Kicker-Profile, Rails |
| `src/physics.js` | Fahrphysik (Carven, Luft, Grinds, Stürze) |
| `src/tricks.js` | Trick-Namen, Punkte, Combos |
| `src/rider.js` | Fahrer: geriggte Figur mit Zwei-Knochen-IK (prozeduraler Fallback) |
| `src/boards.js` | 6 Board-Designs (prozedurale Grafiken) mit Werten für Speed, Pop, Spin |
| `src/world.js` | Terrain, Himmel, Berge, Bäume, Zäune, Park-Elemente |
| `src/effects.js` | Schneespray, Schneefall, Spuren im Schnee |
| `src/assets.js` | Laden der 3D-Modelle |
| `src/audio.js` | Prozeduraler Sound (Wind, Kante, Rail, Landung) |

## 3D-Modelle

Siehe [CREDITS.md](CREDITS.md). Alle Modelle sind CC0.
