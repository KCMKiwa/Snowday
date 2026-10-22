# Credits

## Fahrer-Figuren und Animationen
**Microsoft Rocketbox Avatar Library** und die mitgelieferten Motion-Capture-Animationen ([github.com/microsoft/Microsoft-Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox)), Lizenz MIT.
Verwendete Figuren: Male_Adult_17 (Kai), Female_Adult_04 (Mia), Male_Adult_04 (Ryo), Female_Adult_07 (Zoe), Male_Adult_12 (Theo), Female_Adult_14 (Lena).
Verwendete Animationen (je männlich/weiblich): idle_breathe_01, idle_look_around_01, idle_roll_head_01, idle_shake_arms_01, idle_shake_leg_01, idle_stretch_arms_01, cheer_03, cheer_04.
Für das Spiel mit FBX2glTF konvertiert, Texturen auf 1024 px verkleinert, Meshes quantisiert (`assets/characters/riders/*.glb`, `assets/characters/anims/*.glb`). Schneekleidung entsteht zur Laufzeit in `src/rider.js`, Wintermützen und Goggles in `src/hats.js`, Ski, Skischuhe und Stöcke in `src/skis.js` (alles prozedural).

## Bäume, Felsen, Baumstämme (Fotoscans)
**Poly Haven** ([polyhaven.com](https://polyhaven.com)), Lizenz CC0 1.0.
- Tannen: Zweig- und Rindentexturen aus `fir_tree_01` (Kollektion *Pine Forest*), daraus erzeugt `src/trees.js` die Bäume (`assets/textures/fir_*`).
- Felsen und Stämme: `rock_07`, `rock_face_01`, `rock_face_02`, `dead_tree_trunk`, `tree_stump_01`, für das Spiel mit meshoptimizer vereinfacht und Texturen verkleinert (`assets/props/scan/*.glb`).

## Zelte, Flaggen
**Kenney Starter Kits** (Racing, City Builder, 3D Platformer) von Kenney ([kenney.nl](https://kenney.nl)), Modelle CC0 1.0.
Quellen: https://github.com/KenneyNL/Starter-Kit-Racing, https://github.com/KenneyNL/Starter-Kit-City-Builder, https://github.com/KenneyNL/Starter-Kit-3D-Platformer
Texturen wurden in die GLB-Dateien eingebettet (`assets/props/*.glb`).

## Winter-Requisiten
**Kenney Holiday Kit 2.0** von Kenney ([kenney.nl](https://kenney.nl/assets/holiday-kit)), Lizenz CC0 1.0.
Verwendet: Schneemänner, Schneehaufen, Schlitten, Laterne, Bank, Rentier und Blockhaus-Wände (`assets/props/winter/*.glb`, Textur eingebettet).

## Bibliotheken
[three.js](https://threejs.org) r160 (MIT), per CDN geladen.
