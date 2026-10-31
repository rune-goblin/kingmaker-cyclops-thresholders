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

The macro updates the chosen world actors in place (same ids, so journal links hold), resizes their tokens on every scene, and sets current HP to the new maximum. Running it again is safe: actors it already replaced keep your edits and only get fresh art, token size, full HP, and the module's current version of any spell that is still on legacy data, was since swapped for a different one, or shows broken links. Re-importing the Kingmaker adventure restores the human versions; run the macro again afterwards.

Each spell is the unmodified pf2e original. After adding or swapping a spell in `packs/_source/actors`, run `npm run sync-spells` to copy the originals in from your installed pf2e system, then `npm run build`.

Spells copied by releases before 0.1.7 show "Unknown" links. To repair actors already in a world, run **Kingmaker: Restore Cyclops Spells** from the same compendium: it replaces every pf2e spell on the converted actors, and on their unlinked tokens, with the compendium original, keeping each spell's slot and rank.

## Candlemere Spiral

Run **Kingmaker: Candlemere Spiral** from the same compendium. On the Candlemere Spiral scene it:

- replaces the four mastiffs of Tindalos in the Garden (B6) with Ancient Leng Spiders from *Bestiary 2*, and the three Kingmaker quelaunts in the Black Sand Cavern (B12) with quelaunts from *Monster Core*. Each creature comes in exactly as the bestiary ships it, with no elite or weak adjustment, and an actor the world already holds is reused;
- imports the *Candlemere Spiral Art* journal, with one image page per room encounter, and pins each page in its room as a round thumbnail of its art (the laboratory page goes in A11 on Candlemere Contested). Open a pin and use **Show Players** on the page to share the image;
- gives the Leng envoy, mastiff of Tindalos, Niodrhast, and Ancient Leng Spider actors new portraits and tokens, and retextures their placed tokens. Only art changes; stats stay as Kingmaker and pf2e ship them.

Running it again keeps pins you moved and resized, and only adds what is missing.

To ship new pin positions, move the pins in a world, then run `npm run capture-art -- <world-id>` to copy them into `src/art-placements.json` and rebuild.

Scripts can skip the prompt: `game.modules.get('kingmaker-cyclops-thresholders').api.replaceThresholders()` or `.replaceForas()`. `.restoreSpells()` runs the repair and `.setUpCandlemere()` runs the Candlemere Spiral macro.

## Art

`docs/assets.md` holds generator prompts for the eight portraits and tokens. Drop the results into `assets/portraits/` and `assets/tokens/`. The Candlemere journal art lives in `assets/images/`.

## Build

`npm install && npm run build`, then `npm run setup` to link the module into Foundry.
