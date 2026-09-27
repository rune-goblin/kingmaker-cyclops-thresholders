# Kingmaker: Cyclops Thresholders

Rebuilds the Thresholder cultists of *Kingmaker* chapter 9, "They Lurk Below", and their leader Foras as cyclopes. Each keeps its level, abilities, and spells, and gains:

| Actor | Level | Size | Str | HP | Physical damage | Cyclops abilities |
| --- | --- | --- | --- | --- | --- | --- |
| Thresholder Disciple | 14 | Medium → Large | +5 → +7 | 255 → 280 | Fist 2d6+11 → 2d8+13, Lurker Claw 2d12+11 → 2d12+13, Shuriken 1d4+11 → 1d6+13 | Ferocity, Flash of Brutality |
| Thresholder Hermeticist | 16 | Medium → Large | +2 → +4 | 290 → 320 | Dagger 3d4+8 → 3d6+10 | Ferocity, Flash of Insight |
| Thresholder Mystic | 17 | Medium → Large | +0 → +2 | 315 → 345 | Dagger 3d4+6 → 3d6+8 | Ferocity, Flash of Insight |
| Foras | 19 | Medium → Large | +0 → +2 | 355 → 390 | Staff 3d4+10 → 3d6+12 | Ferocity, Flash of Insight |

Traits swap `human` for `giant`, the Disciple's Athletics rises by 2, all four speak Cyclops, and Unseen Sight describes a single removed eye. Tokens grow to 2 × 2.

## Use

1. Import the Kingmaker adventure into your world and enable this module.
2. As GM, run the **Kingmaker: Make Cyclopes** macro from the *Cyclops Thresholders Macros* compendium and choose **Thresholders**, **Foras**, or **All four**.

The macro updates the chosen world actors in place (same ids, so journal links hold), resizes their tokens on every scene, and sets current HP to the new maximum. Running it again is safe: actors it already replaced keep your edits and only get fresh art, token size, and full HP. Re-importing the Kingmaker adventure restores the human versions; run the macro again afterwards.

Scripts can skip the prompt: `game.modules.get('kingmaker-cyclops-thresholders').api.replaceThresholders()` or `.replaceForas()`.

## Art

`docs/assets.md` holds generator prompts for the eight portraits and tokens. Drop the results into `assets/portraits/` and `assets/tokens/`.

## Build

`npm install && npm run build`, then `npm run setup` to link the module into Foundry.
