# Snowday

3D-Snowboard- und Freeski-Spiel im Browser (Three.js) mit drei Strecken, Carving-Physik, Butters, Grabs, Flips, Grinds und Combo-Wertung.

## Snowboard oder Ski

Im Menü unter *Ausrüstung* wird zwischen **Snowboard** und **Ski** gewechselt (wird gespeichert).

- **Ski:** Twin-Tip-Parkski mit Taillierung, Camber und Rocker, Alpinbindungen, Skischuhe (Schale, Schaft am Schienbein) und Stöcke in den Fäusten. Haltung wie im Skiunterricht: Füße hüftbreit, Schienbeine im Schuh nach vorn, Hände vorn. In Kurven Kurvenlage plus Hüftknick (Hüfte nach innen, Oberkörper über dem Außenski, kurveninnerer Ski höher), Stockeinsatz beim Kurvenwechsel, Hocke mit den Stöcken unter den Armen, Doppelstockschub auf flachen Stücken, Hockey Stop zum Bremsen.
- Ski greifen etwas besser und reagieren schneller, in der Hocke ist der Luftwiderstand kleiner.
- Freeski-Namen: Spins nach links/rechts (*Left 540*), Rodeo, Misty, Cork, Lincoln Loop; Grabs *Safety, Mute, Critical, Blunt, Tip, Tail, Truckdriver, Japan*; auf Rails *Slide* statt Boardslide.

## Strecken

| Strecke | Charakter |
| --- | --- |
| **Slopestyle Park** | 800 m, 15°, 7 Kicker, 8 Rails & Boxes, Tageslicht |
| **Jib Garden** | 520 m, 12°, 13 Rails, Boxes, Ledges und ein Log, 3 kleine Kicker, Abendsonne mit Laternen |
| **Backcountry** | 900 m, 19°, Tiefschnee, natürliche Kicker (Windlips, Cornice), Roller, umgestürzte Baumstämme, Felsen und Bäume als Hindernisse, bedeckter Himmel mit Schneefall |

Die Strecke wird im Menü gewählt, der Bestwert wird pro Strecke gespeichert.

## Tageszeit, Licht und Wetter

Im Menü unter *Setup → Tageszeit*: **Auto** (die Zeit der Strecke), **Morgen**, **Mittag**, **Abend**, **Nacht** oder **Zyklus** (ein Tag in sechs Minuten).

- **Sonne und Mond** stehen wie in den Alpen im Spätwinter (47° Nord): tiefe Mittagssonne, lange Schatten, Sonnenuntergang am späten Nachmittag, nachts Mondlicht.
- **Himmel:** Einfachstreuung (Rayleigh + Mie) mit Luftmasse: blauer Himmel, weißer Horizont, rote Sonne am Abend, Dämmerung, Sterne. Dieselbe Rechnung färbt Sonnen-/Mondlicht, Himmelslicht und Nebel, damit Licht und Himmel zusammenpassen.
- **Wolken:** bewegte Wolkenschicht, von Sonne oder Mond beleuchtet (heller Rand zur Lichtquelle hin); bei *Bedeckt* (Backcountry) eine graue Wolkendecke, die zur eigentlichen Lichtquelle wird.
- **Nebel und Dunst:** Nebel in der Farbe des Horizonts, Bergkette im Dunst, morgens und bei Bewölkung Nebelbänke im Tal.
- **Schatten:** zwei Kaskaden, eine scharfe um den Fahrer und eine weite für Bäume an den Hängen.
- **Nacht:** Flutlichtmasten entlang von Park und Jib Garden (Lichtkegel, Lichtpools auf dem Schnee); die Belichtung passt sich dem Licht an wie ein Auge.

## Starten

Das Spiel lädt ES-Module und 3D-Modelle per `fetch`, braucht also einen lokalen Webserver:

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Steuerung (Tastatur)

| Taste | Aktion |
| --- | --- |
| `W` / `↑` | Tuck / Hocke (schneller), langsam anschieben (Ski: Doppelstockschub) |
| `S` / `↓` | Bremsen (Board quer, Skid; Ski: Hockey Stop) |
| `A` `D` / `←` `→` | Carven, in der Luft drehen (Spins) |
| `Leertaste` | Halten = Pop laden, loslassen = Ollie. An der Kickerkante loslassen gibt extra Höhe |
| `Leertaste` + `A` `D` | Beim Laden aufdrehen (Pre-Wind): die Drehung startet schon an der Kante |
| `E` / `Q` | Nose / Tail Butter. Dabei `A` `D` = Butter-Spins (180, 360 …) |
| `E` + `Leertaste` | Nollie aus dem Nose Press |
| `W` / `S` in der Luft | Frontflip / Backflip (mit Spin: Misty / Rodeo) |
| `Leertaste` + `W` / `S` | Flip schon beim Absprung laden (W/S erst nach dem Laden drücken) |
| `Q` / `E` in der Luft | Wildcat / Tamedog (mit Spin: Cork) |
| `J` `K` `L` | Indy, Mute, Melon (Ski: Safety, Mute, Critical) |
| `U` `I` `O` | Nosegrab, Stalefish, Tailgrab (Ski: Tip, Blunt, Tail) |
| `B` `N` | Method, Japan (Ski: Truckdriver, Japan) |
| `A` `D` auf dem Rail | Balance halten, `Leertaste` = Absprung |
| `W` / `S` (oder `E` / `Q`) auf dem Rail | Nose Press / Tail Press |
| `R` | Run neu starten |
| `Esc` | Pause |
| `H` | Steuerung einblenden |
| `M` | Ton an/aus |

Drehungen sind komplett von Hand gesteuert, ohne Automatik: Halten dreht (`A`/`D` Spin, `W`/`S` Flip, `Q`/`E` Roll), die Drehung baut sich weich auf, am stärksten direkt an der Kante (beim Laden schon `A`/`D` halten = Spin ab der Kante). Loslassen öffnet den Körper, die Drehung läuft natürlich aus und bleibt stehen, wo sie stehen bleibt. Nichts wird auf einen sauberen Winkel gerundet: Wer zu früh loslässt, landet schräg, wer zu lange hält, überdreht. Ein gehaltener Grab hält den Körper kompakt, die Drehung läuft dann deutlich länger weiter (Grab loslassen = öffnen und landen). Die Achsen sind die des Körpers: Spin und Flip gleichzeitig ergibt eine echte Schrägachse (Cork, Rodeo, Misty); ein Spin, der erst mitten im Flip dazukommt, kippt nur den Flip. Die Anzeige in der Luft zeigt, als was die Drehung zählt, wenn man jetzt loslässt, und färbt sich danach, wie das landen würde (grün sauber, gelb sketchy, rot Sturz). Sie zeigt nur an, sie greift nicht ein. Wer weder flippt noch rollt und ungefähr aufrecht ist, gleicht Neigung und Seitenlage von selbst der Landung an, wie echte Fahrer (der Spin bleibt dabei unberührt). Sauber landen heißt: Board bzw. Ski in Fahrtrichtung (vorwärts oder switch) und aufrecht. Leicht schief gibt *Sketchy* (halbe Punkte, kurzer Wackler), zu schief einen Sturz: Der Fahrer fällt auf die Seite, zu der er kippt (Snowboard: rückwärts auf Po und Rücken oder nach vorn auf die Knie, das Board kippt dabei auf die Zehenkante; Ski: seitlich auf die Hüfte), rutscht auf dem Schnee aus, bleibt kurz liegen und steht an derselben Stelle wieder auf. Der Körper liegt dabei immer auf dem Schnee, nie darin. Tricks innerhalb kurzer Zeit verketten sich zu einer Combo mit Multiplikator; Butters halten die Combo am Leben.

### Fahrphysik

Die Kante trägt nur so viel Querbeschleunigung, wie der Schnee hergibt (~1,9 g): bei hohem Tempo wird der Kurvenradius größer, im Schritttempo lässt sich das Board drehen. Rutscht das Board quer zur Fahrtrichtung (Skid, schiefe Landung), bremst es entsprechend. Der Fahrer legt sich in die Kurve. Abseits der präparierten Piste bremst Tiefschnee, das Board sinkt ein und staubt stärker.

### Tricks

- **Air:** Spins (180 bis 1440+), Flips, Wildcats/Tamedogs, Rodeos, Mistys, Corks, Shifty; Präfixe *Switch* und *Nollie*, Suffix *Out* nach einem Rail
- **Grabs:** 8 Grabs, *Tweaked* bei langem Halten, Grab-Wechsel (*Indy to Method*) geben Bonus
- **Butters:** Nose/Tail Butter, Butter-Spins
- **Rails:** 50-50, Nose/Tail Press, Frontside/Backside Boardslide und Lipslide, Spin-Ons (*Frontside 270 on …*), Switch

### Rail-Hilfe

Mit *Rail-Hilfe: An* (Standard) zieht das Spiel den Fahrer auf ein Rail, auf das er zufährt: seitliche Korrektur, ein kleiner Hüpfer auf Rail-Höhe, weicheres Einrasten und eine Balance, die sich selbst zentriert. Mit *Aus* gilt die alte, strenge Physik.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `src/maps.js` | Streckendefinitionen, Wetter und Standard-Tageszeit |
| `src/atmosphere.js` | Tageszeit, Himmel (Streuung, Wolken, Sterne, Mond), Sonnen-/Mondlicht mit zwei Schattenkaskaden, Himmelslicht, Nebel, Talnebel, Flutlicht, Belichtung |
| `src/post.js` | Nachbearbeitung: MSAA, Bloom auf Glanzlichtern, Farbabstimmung, Vignette |
| `src/course.js` | Strecke: analytisches Höhenfeld, Kicker, Roller, Rails, Hindernisse |
| `src/physics.js` | Fahrphysik (Carven mit Grip-Limit, Butters, Drehungen mit Schwung und Landehilfe, Rail-Hilfe, Grinds, Stürze in Phasen) |
| `src/tricks.js` | Trick-Namen, Punkte, Combos |
| `src/rider.js` | Fahrer: 6 fotorealistische Rocketbox-Figuren in Schneekleidung (Outfit-Farbe über dem Originalstoff), Zwei-Knochen-IK auf Board oder Ski, Motion-Capture-Idles und Jubel im Menü, Trick-Posen (Ausholen, Schulter führt, Tuck, Landung anvisieren), Sturzposen auf dem Schnee |
| `src/boards.js` | 6 Board-Designs mit Werten für Speed, Pop, Spin; Board mit Camber, Spoon-Tips, Clearcoat-Topsheet, Base, Kanten und Bindungen (Highback, Straps, Ratschen) |
| `src/hats.js` | Wintermützen, auf jeden Kopf angepasst (Schädelform aus den Augen, Mützenrand auf dem gemessenen Kopf, Haare darunter flachgedrückt): Fisherman Beanie, Bommelmütze, Chullo mit Ohrenklappen, Fellmütze (Trapper), Rippbeanie, Slouch Beanie; Goggles auf der Mütze |
| `src/skis.js` | Parkski (Taillierung, Camber, Rocker, Topsheet im Board-Design), Alpinbindung, Skischuhe, Stöcke |
| `src/trees.js` | Tannen aus Poly-Haven-Fotoscan-Texturen (Zweig-Karten, Rinde, Schnee auf den Nadeln) |
| `src/world.js` | Terrain mit Schnee-Shader (inkl. Talabschluss), Bergkette, Tannenwald, gescannte Felsen/Felswände/Stümpfe, Lodge, Zäune, Flutlichtmasten, Park-Elemente (Logs aus gescanntem Baumstamm) |
| `src/effects.js` | Beleuchtetes Schneespray, Schneefall, Spurrillen, Funken, Fahrtwind-Streifen, Kontaktschatten |
| `src/assets.js` | Laden der 3D-Modelle |
| `src/audio.js` | Prozeduraler Sound (Wind, Kante, Rail, Landung) |

## 3D-Modelle

Siehe [CREDITS.md](CREDITS.md). Alle Modelle sind CC0.
