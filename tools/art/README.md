# Art generation

Concept and production art made with Cloudflare Workers AI (FLUX.2 image models), run from GitHub Actions.

## How it works

1. A **batch** is a JSON file in `batches/`: a list of images, each with an `id`, a `model`, a `prompt`, a size, a `seed` and optional reference images (`refs`, paths in this repo).
2. Run the **Generate art** workflow (Actions tab → Generate art → Run workflow) with the batch name. Claude can start it from a session too.
3. The images land on the **`art` branch** under `art/<batch>/`, with a `manifest.json` recording each prompt, and are attached to the run as an artifact. Nothing is committed to `main`, so nothing deploys.
4. Chosen images are compressed to WebP and copied into `public/img/` by hand (for a harbour: `public/img/ports/<port id>.webp`, then add the port to `PAINTED` in `public/js/scene.js`).

## Models

| Model | Use | Reference images | Price (Oct 2026) |
| --- | --- | --- | --- |
| `black-forest-labs/flux-2-pro-preview` | Final art | By URL (the repo is public, so refs are read from raw.githubusercontent.com at the run's commit) | About 5 US cents for a 1600×896 image, paid from AI Gateway credits |
| `@cf/black-forest-labs/flux-2-klein-9b` | Quick drafts | Uploaded, up to 4, each under 512×512 | A fraction of a cent, on the normal Workers AI bill |

## References

`refs/` holds the game's own pictures, used to keep generated art in the game's layout:

- `lisbon-layout.jpg`: the Lisbon arrival scene as the game paints it, without the ship. The horizon at half height, open water on the left (where the ship sails in) and the quay on the right are what the scene code expects.
- `caravel-drawing.png`: the São Cristóvão as drawn in the game.

## Secrets

The workflow needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a Workers AI token, from Workers AI → Use REST API) and `CLOUDFLARE_ACCOUNT_ID`. Partner models such as FLUX.2 [pro] also need AI Gateway credits in the Cloudflare account.

## Run locally

```
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node tools/art/generate.mjs lisbon-look-1 harbour-photo
```

Reference images for the pro model need `GITHUB_REPOSITORY` and `GITHUB_SHA` set to a pushed commit.
