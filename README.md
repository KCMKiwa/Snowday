# Snowday

3D-Snowboard- und Freeski-Spiel im Browser (Three.js) mit drei Strecken, Carving-Physik, Butters, Grabs, Flips, Grinds und Combo-Wertung.

## Snowboard oder Ski

Im *Locker* wird zwischen **Snowboard** und **Ski** gewechselt (wird gespeichert).

- **Ski:** Twin-Tip-Parkski mit Taillierung, Camber und Rocker, Alpinbindungen, Skischuhe (Schale, Schaft am Schienbein) und Stöcke in den Fäusten. Haltung wie im Skiunterricht: Füße hüftbreit, Schienbeine im Schuh nach vorn, Hände vorn. In Kurven Kurvenlage plus Hüftknick (Hüfte nach innen, Oberkörper über dem Außenski, kurveninnerer Ski höher), Stockeinsatz beim Kurvenwechsel, Hocke mit den Stöcken unter den Armen, Doppelstockschub auf flachen Stücken, Hockey Stop zum Bremsen.
- Ski greifen etwas besser und reagieren schneller, in der Hocke ist der Luftwiderstand kleiner.
- Freeski-Namen: Spins nach links/rechts (*Left 540*), Cork, Bio, Rodeo, Misty, Lincoln Loop; Grabs *Safety, Mute, Critical, Blunt, Tip, Tail, Truckdriver, Japan*; auf Rails *Slide* statt Boardslide.

## Strecken

| Strecke | Charakter |
| --- | --- |
| **Slopestyle Park** | 800 m, 15°, 7 Kicker, 8 Rails & Boxes, Tageslicht |
| **Jib Garden** | 520 m, 12°, 13 Rails, Boxes, Ledges und ein Log, 3 kleine Kicker, Abendsonne mit Laternen |
| **Backcountry** | 900 m, 19°, Tiefschnee, natürliche Kicker (Windlips, Cornice), Roller, umgestürzte Baumstämme, Felsen und Bäume als Hindernisse, bedeckter Himmel mit Schneefall |

Die Strecke wird unter *Play* gewählt, der Bestwert wird pro Strecke gespeichert.

## Menü

Ein Startbildschirm im Stil eines Fighting Games (angelehnt an 2XKO) mit drei großen Buttons, wählbar mit `↑`/`↓` und `Enter` (oder Maus/Touch), `Esc` führt zurück:

- **Play:** Map wählen (große Karten mit Länge, Gefälle, Features und Rekord), Setup (Rail-Hilfe, Tageszeit, Grafik) und Steuerung; *Drop in* (`Enter`) startet den Run.
- **Locker:** Fahrer, *Kleidung* (14 Outfits aus Jacke, Hose, Helm, Handschuhen und Goggles, jedes als kleine Figur: anklicken zum Anziehen) und *Board & Ski* (`←`/`→` blättert durch alle 9 Designs).
- **Shop:** Board-/Ski-Designs und Outfits gegen **Flakes** (❄). Zum Start gibt es 1.000 Flakes, danach für jeden Run, der unten ankommt: 25 plus 1 je 100 Punkte. Polar Night, Sunset Drive und die Outfits Signal und Glacier sind von Anfang an da, alles andere kostet 300 bis 3.000 Flakes (darunter die Designs Snow Camo, Neon Stripes und Checkmate und Outfits wie Lava, Retro 90 oder Gold Rush); was gekauft ist und die Flakes werden im Browser gespeichert. Ein Klick auf eine Karte probiert sie am Fahrer an. Auch im Locker lassen sich alle Designs und Outfits durchblättern und anprobieren; was noch nicht gekauft ist, hat dort direkt einen Kaufen-Button. Reichen die Flakes nicht, sagt eine Meldung, wie viele noch fehlen.

Das Menü (samt Pause, Ergebnis und Ladebildschirm) trägt die Farben von 2XKO: Anthrazit, Grau und Off-White mit Limette als einzigem Akzent; die Anzeigen im Run behalten ihre Farben.

## Kamera

Wie die nahe Kamera von cork7 (deren Standard): 4,3 m hinter, 1,3 m über und etwas links vom Fahrer, bei jedem Tempo gleich nah. Nur Blickrichtung und Höhe werden geglättet, damit der Fahrer nie davonzieht. Der Arm kippt mit dem Hang dahinter, der Blick folgt dem Hang voraus und hält den Fahrer zwischen Bildmitte und unterem Drittel; ganz aus dem Bild fällt er nie. Bei großen Sprüngen (über 1,3 s Luft) zieht sie heraus, nach oben und zur Seite, um Trick und Landung zu zeigen, beim Sturz geht sie etwas zurück. Bei Tempo wird das Bild weiter, bei Landungen wippt sie nach unten.

## Tageszeit, Licht und Wetter

Unter *Play → Setup → Tageszeit*: **Auto** (die Zeit der Strecke), **Morgen**, **Mittag**, **Abend**, **Nacht** oder **Zyklus** (ein Tag in sechs Minuten).

- **Sonne und Mond** stehen wie in den Alpen im Spätwinter (47° Nord): tiefe Mittagssonne, lange Schatten, Sonnenuntergang am späten Nachmittag, nachts Mondlicht.
- **Himmel:** Einfachstreuung (Rayleigh + Mie) mit Luftmasse: blauer Himmel, weißer Horizont, rote Sonne am Abend, Dämmerung, Sterne. Dieselbe Rechnung färbt Sonnen-/Mondlicht, Himmelslicht und Nebel, damit Licht und Himmel zusammenpassen.
- **Wolken:** bewegte Wolkenschicht, von Sonne oder Mond beleuchtet (heller Rand zur Lichtquelle hin); bei *Bedeckt* (Backcountry) eine graue Wolkendecke, die zur eigentlichen Lichtquelle wird.
- **Nebel und Dunst:** Nebel in der Farbe des Horizonts, Bergkette im Dunst, morgens und bei Bewölkung Nebelbänke im Tal.
- **Schatten:** zwei Kaskaden, eine scharfe um den Fahrer und eine weite für Bäume an den Hängen.
- **Nacht:** Flutlichtmasten entlang von Park und Jib Garden (Lichtkegel, Lichtpools auf dem Schnee); die Belichtung passt sich dem Licht an wie ein Auge.

## Leistung

- **Auflösung passt sich an:** Werden Bilder zu langsam, rendert das Spiel mit etwas weniger Auflösung (bis 50 %), bei Luft wieder mit voller; *Grafik: Hoch* begrenzt die Pixeldichte auf 1,25, *Leistung* auf 1 (ohne Nachbearbeitung, kleinere Schatten, weniger Wolkendetail). Handys und Tablets starten auf *Leistung*.
- **Nur was zu sehen ist, wird gezeichnet:** Bäume, Felsen, Stümpfe und Felswände liegen in Abschnitten entlang des Tals, die Kamera und Schattenkameras überspringen, was sie nicht sehen; in der Ferne gibt es leichtere Bäume und gröberes Gelände, kleine Dinge verschwinden im Dunst, nur Nahes wirft Schatten.
- **Wenige Draw Calls:** Statische Teile mit gleichem Material (Pfosten, Rails, Schilder, Requisiten, Masten) werden pro Abschnitt zu einem Mesh zusammengefasst.
- **Licht nur, wenn es an ist:** Flutlichter sind tagsüber ganz aus der Szene (sonst kostet jedes Licht jeden Pixel); die Shader für beide Fälle werden beim Laden vorkompiliert.

## Starten

Das Spiel lädt ES-Module und 3D-Modelle per `fetch`, braucht also einen lokalen Webserver:

```bash
python3 serve.py
# dann http://localhost:8000 öffnen
```

`serve.py` ist `python3 -m http.server` mit einem `Cache-Control: no-cache`-Header. Außerdem hängt `index.html` auf einem lokalen Server an jedes Modul aus `src/` die Ladezeit an (Import-Map, z. B. `main.js?v=…`): Der Browser kann so nie eine alte Kopie eines Moduls unter einer neueren Seite ausführen (sonst funktioniert das Spiel nur halb, z. B. reagieren die Menü-Buttons nicht). Neue Dateien in `src/` gehören in die Liste in `index.html`. Ein Skriptfehler erscheint als roter Balken oben im Bild.

## Steuerung (Tastatur)

| Taste | Aktion |
| --- | --- |
| `W` | Anschieben (Ski: Doppelstockschub); nach 1,25 s gehalten oder ab 65 km/h Tuck (schneller) |
| `S` | Bremsen (Board quer, Skid; Ski: Hockey Stop); auf den letzten 12 m vor einem Kicker und auf seiner Rampe lädt `S` stattdessen den Backflip, und `A`/`D` dreht dort den Spin vor, statt aus der Spur zu carven |
| `A` `D` | Carven, in der Luft drehen (Spins) |
| `Leertaste` | Halten = Pop laden, loslassen = Ollie. An der Kickerkante loslassen gibt extra Höhe |
| `Leertaste` + `A` `D` | Beim Laden aufdrehen (Pre-Wind): die Drehung startet schon an der Kante |
| `E` / `Q` | Nose / Tail Butter. Dabei `A` `D` = Butter-Spins (180, 360 …) |
| `E` + `Leertaste` | Nollie aus dem Nose Press |
| `W` / `S` in der Luft | Frontflip / Backflip (Snowboard: über Zehen / Fersen), gehalten so getaktet, dass er zur Landung aufgeht |
| `A` `D` + `S` an der Kante | Cork (`S` weiter halten = Double Cork) |
| `A` `D` + `W` an der Kante | Bio (Snowboard: Cork nach vorn) |
| `↑` + `A` `D` + `S` / `W` | Rodeo / Misty: die Füße gehen über den Kopf |
| `Leertaste` + `W` / `S` | Flip schon beim Absprung laden (W/S erst nach dem Laden drücken) |
| `←` / `→` in der Luft | Cartwheel (Snowboard) / Lincoln Loop (Ski), mit Spin an der Kante: Flatspin |
| `J` `K` `L` | Indy, Mute, Melon (Ski: Safety, Mute, Critical) |
| `U` `I` `O` | Nosegrab, Stalefish, Tailgrab (Ski: Tip, Blunt, Tail) |
| `B` `N` | Method, Japan (Ski: Truckdriver, Japan) |
| `A` `D` auf dem Rail | Balance halten, `Leertaste` = Absprung |
| `W` / `S` (oder `E` / `Q`) auf dem Rail | Nose Press / Tail Press |
| `R` | Run neu starten |
| `Esc` | Pause |
| `H` | Steuerung einblenden |
| `M` | Ton an/aus |

Die Luftsteuerung ist die von cork7, nur ruhiger: Eine gehaltene Taste dreht den Körper mit fester Rate, fast sofort und schon ab der Kante (Tasten wie bei cork7: `A`/`D` Spin, `W`/`S` Flip, `←`/`→` Roll, `↑` über Kopf), und loslassen stoppt die Drehung innerhalb eines Augenblicks. Der Körper dreht also genau so lange, wie man hält. Ein gehaltener Flip ist so getaktet, dass er auf den Füßen aufgeht: Wenn er beginnt, wird geschaut, wie viele Umdrehungen bei etwa 4,4 rad/s in die Luft passen (mindestens eine), und die Rate (2,6 bis 7,5 rad/s) so gesetzt, dass sie kurz vor der Landung fertig sind. Wer `S` vom Kicker bis zur Landung hält, landet also einen Backflip, auf einem großen Kicker einen Double, statt halb gedreht auf dem Kopf; ein gehaltener Spin dreht etwas schneller (4,8 rad/s), mit gehaltenem Grab noch schneller (6,6 rad/s); das *Spin*-Rating des Boards skaliert das. Eine Taste, die an der Kante schon gehalten wird, zählt sofort: Wer mit `W` im Tuck über die Kante fährt, macht einen Frontflip, wer `S` hält, einen Backflip. Nur `W`/`S` aus einem Rail-Press und *TAIL*/*NOSE* (Touch) aus einem Butter drehen erst, wenn sie einmal losgelassen wurden. Die Gegentaste bremst einen Flip erst ab, bevor sie ihn umdreht. Ist alles losgelassen und dreht der Körper kaum noch, richtet er sich auf dem kürzesten Weg auf (Landehilfe wie bei cork7, bis 3,4 rad/s) und legt sich in den letzten anderthalb Sekunden vor der Landung in die Neigung des Hangs: Ein Flip, der über die Hälfte hinaus losgelassen wird, geht ganz herum, einer, der zu früh losgelassen wird, fällt zurück. Der Spin bleibt dabei unberührt, ihn gerade zu landen ist Sache des Spielers (zu früh loslassen = schräg landen, zu lange halten = überdrehen). Solange ein Grab einen Trick über Kopf festhält, gibt es keine Landehilfe: zum Landen den Grab loslassen. Wer nur spinnt und aufrecht ist, gleicht die Neigung sanft der Landung an. Die Achsen sind die des Körpers: Beim Snowboard geht der Backflip (`S`) rückwärts über die Fersen, der Frontflip (`W`) über die Zehen, also um die Längsachse des Boards, wie ein echter Snowboard-Backflip; `←`/`→` ist der Cartwheel über Nose und Tail. Beim Ski ist es der Salto über die Hüftachse und `←`/`→` der Lincoln Loop. In der Luft dreht der Körper um die Hüfte (wie bei cork7, 0,94 m über den Füßen), nicht um die Ski bzw. das Board, und der Skifahrer nimmt die Posen von cork7 ein (an dessen Fahrer abgemessen und für unsere Figur nachgebaut, je nach gehaltener Taste überblendet): ohne Taste groß und locker (Knie leicht gebeugt, Ellbogen etwas nach außen, Hände vor der Hüfte, Stöcke nach hinten); `S` gehalten der überstreckte Backflip (Kopf und Schultern nach hinten, Knie gebeugt und Füße nach hinten, Skispitzen nach unten, Arme weit ausgebreitet); `W` der Frontflip (Brust über den Ski); `A`/`D` der Spin (Arme weit auf Bauchhöhe); Spin und Flip an der Kante der Cork (Schultern eingedreht, die äußere Hand vor dem Bauch); in der letzten halben Sekunde vor der Landung öffnen sich die Arme nach vorn. Ein Flip geht immer zum eigenen Rücken bzw. zur eigenen Brust, auch switch oder nach einem 180, und behält seine Achse im Raum. Spin und Flip zusammen an der Kante (beim Laden des Pops oder in den ersten 0,25 s in der Luft, wie bei cork7) ergeben einen Off-Axis-Trick: Der Körper flippt um eine schräge Achse, die ab dem Absprung fest im Raum steht, und dreht sich dabei um die eigene Wirbelsäule weiter wie bei einem Spin. `A`/`D` + `S` = **Cork** (Achse 55° schräg, der Kopf geht einmal pro Umdrehung unter das Board), `A`/`D` + `W` = **Bio** (Cork nach vorn; beim Snowboard heißt er auch Cork), mit `↑` (Touch: *RODEO*) dazu gehen die Füße über den Kopf: mit `S` **Rodeo**, mit `W` **Misty** (70°). `A`/`D` + `←`/`→` = **Flatspin**. `↑` darf auch noch kurz nach dem Absprung kommen und macht dann aus dem Cork einen Rodeo. Die Flip-Taste treibt den Flip, getaktet wie oben: Reicht die Luft für zwei Umdrehungen, wird es ein *Double*. Die Spin-Taste treibt die Drehung um die Wirbelsäule und wird gelandet wie ein Spin: Cork 540 landet switch, Cork 720 vorwärts, Double Cork 1080 braucht weniger Spin als Double Cork 1440. Gezählt wird wie bei den Judges: jede Umdrehung um die schräge Achse ist eine 360, dazu die Drehung um die Wirbelsäule; wie oft der Körper wirklich über Kopf war, gibt *Double* oder *Triple*. Die Gegentaste bremst die jeweilige Drehung. Ein Spin, der erst später zu einem Flip dazukommt, kippt nur den Flip. Die Anzeige in der Luft zeigt, als was der Trick zählt, wenn man jetzt loslässt (samt Aufrichten), und färbt sich danach, wie das landen würde (grün sauber, gelb sketchy, rot Sturz, auch wenn der Kopf vor dem Board auf den Schnee käme); sie zeigt nur an, loslassen muss der Spieler. Gelandet wird wie bei cork7: sauber, solange der Körper vor/zurück höchstens 45° und zur Seite höchstens 20° vom Hang abweicht und Board bzw. Ski in Fahrtrichtung zeigen (vorwärts oder switch); darüber hinaus bis etwa 75° (auch quer) ist es *Sketchy*, also gerettet (halbe Punkte, kurzer Wackler); noch schiefer oder zu hart aufgeschlagen ist es ein Sturz: Der Fahrer fällt auf die Seite, zu der er kippt (Snowboard: rückwärts auf Po und Rücken oder nach vorn auf die Knie, das Board kippt dabei auf die Zehenkante; Ski: seitlich auf die Hüfte), rutscht auf dem Schnee aus, bleibt kurz liegen und steht an derselben Stelle wieder auf. Der Körper liegt dabei immer auf dem Schnee, nie darin. Tricks innerhalb kurzer Zeit verketten sich zu einer Combo mit Multiplikator; Butters halten die Combo am Leben.

### Fahrphysik

Die Kante trägt nur so viel Querbeschleunigung, wie der Schnee hergibt (~1,9 g): bei hohem Tempo wird der Kurvenradius größer, im Schritttempo lässt sich das Board drehen. Rutscht das Board quer zur Fahrtrichtung (Skid, schiefe Landung), bremst es entsprechend. Der Fahrer legt sich in die Kurve. Abseits der präparierten Piste bremst Tiefschnee, das Board sinkt ein und staubt stärker.

### Tricks

- **Air:** Spins (180 bis 1440+), Back- und Frontflips, Corks, Rodeos, Mistys, Flatspins, Cartwheels / Lincoln Loops, Shifty; Präfixe *Switch* und *Nollie*, Suffix *Out* nach einem Rail
- **Grabs:** 8 Grabs, *Tweaked* bei langem Halten, Grab-Wechsel (*Indy to Method*) geben Bonus. Beim Ski deutlich wie bei cork7: Die Knie kommen hoch zur Brust, die Ski werden gekreuzt oder zur Seite gezogen (Mute, Japan), die Hand greift sichtbar an Ski oder Spitze und der freie Arm geht weit zur Seite.
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
| `src/shop.js` | Shop: Preise der Designs und Outfits, Flakes pro Run, was gekauft ist (im Browser gespeichert) |
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
