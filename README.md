# Kingmaker: Cyclops Thresholders

Rebuilds the Thresholder cultists of *Kingmaker* chapter 9, "They Lurk Below", as cyclopes. Each keeps its level, abilities, and spells, and gains:

| Actor | Level | Size | Str | HP | Physical damage |
| --- | --- | --- | --- | --- | --- |
| Thresholder Disciple | 14 | Medium → Large | +5 → +7 | 255 → 280 | +2 (Fist, Lurker Claw, Shuriken) |
| Thresholder Hermeticist | 16 | Medium → Large | +2 → +4 | 290 → 320 | +2 (Dagger) |
| Thresholder Mystic | 17 | Medium → Large | +0 → +2 | 315 → 345 | +2 (Dagger) |

Traits swap `human` for `giant`, the Disciple's Athletics rises by 2, all three speak Cyclops, and Unseen Sight describes a single removed eye. Tokens grow to 2 × 2. Foras stays human.

## Use

1. Import the Kingmaker adventure into your world and enable this module.
2. As GM, run the **Kingmaker: Make Thresholders Cyclopes** macro from the *Cyclops Thresholders Macros* compendium.

The macro updates the world's Thresholder actors in place (same ids, so journal links hold) and resizes their tokens on every scene. Re-importing the Kingmaker adventure restores the human versions; run the macro again afterwards.

## Art

`docs/assets.md` holds generator prompts for the six portraits and tokens. Drop the results into `assets/portraits/` and `assets/tokens/`.

## Build

`npm install && npm run build`, then `npm run setup` to link the module into Foundry.
