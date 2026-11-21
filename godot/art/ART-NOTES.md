# Helmline art notes

What works for Helmline's art on Allan's ComfyUI (RTX 3060, 12 GB). Built on the Warp Miner Klein
notes, then tested for this game's look. Change one thing at a time, keep seeds 111/222/333/444.

## Klein stills (ships, props)

Setup, as Warp Miner: `flux3-image-klein-int8-convrot` (the regular one, not base), text encoder
`qwen3vl_4b_int8_convrot` (CLIPLoader, flux3), VAE `flux2-vae`, EmptyFlux2LatentImage 1024x1024,
KSampler 16 steps, cfg 1, euler, simple. About 25-30 s a picture here. POST /free with
`{"unload_models": true, "free_memory": true}` after every batch.

Round 1 and 2 (2026-11-20, caravel), findings:
- "Caravel" alone gives a square-rigged carrack. The **layout sentence** fixes it every time:
  "Two masts, each with a large triangular lateen sail of off-white canvas, like the caravels of
  Prince Henry's captains; a high rounded stern castle, a low waist, a short bowsprit."
- "The ship floats alone, no water, no sea: isolated on a plain light grey background" keeps the
  sea out (without it, half the seeds add water and reflections).
- The Portuguese sail cross: "the cross of the Order of Christ: a red cross with flared ends and a
  thin white cross inside it" comes out right. "A red cross" gives a plain St George cross.
- Camera: "Seen from three-quarters ahead, from a little above the waterline ... bow towards the
  left" keeps true lateen sails. A raised view ("about thirty degrees down ... the open deck is
  visible") shows the deck but turns the sails squarish.
- Best of round 2: E_111, E_333 (low 3/4), G_111 (raised).

The caravel prompt that works (row E):

> A 15th-century Portuguese caravel, a small wooden sailing ship of the age of exploration, for a
> trading game set in 1450s Lisbon. Seen from three-quarters ahead, from a little above the
> waterline: the whole ship is in frame, bow towards the left, nothing cut off. Two masts, each
> with a large triangular lateen sail of off-white canvas, like the caravels of Prince Henry's
> captains; a high rounded stern castle, a low waist, a short bowsprit. Each sail carries the cross
> of the Order of Christ: a red cross with flared ends and a thin white cross inside it. Weathered
> oak planking, black tarred seams, hemp rigging, warm afternoon light. The ship floats alone, no
> water, no sea: isolated on a plain light grey background.

Template: [what it is] for [the game and its world], [camera sentence]. [layout with a famous
real-world comparison]. [markings, in exact words]. [materials and light]. [isolated on plain
light grey].

## Trellis (3D ships)

Allan's TRELLIS.2 install is at S:\Trellis (not the ComfyUI template: its models aren't
installed). Runner: S:\Trellis\run-browser\wm-watch.bat waits for code\wm_go\<name>.go and runs
code\wm_exp.py <name>: jobs from code\wm_<name>q\jobs.json, models into code\wm_<name>\.
Helmline uses the name `hl`. Settings as Warp Miner: 1024_cascade, seed 42.

## LTX-2.5 (clips)

The official LTX-2.5 Image to Video template, 736x416 (0.3 MP), 3 s: about 97 s a clip. Lisbon
harbour test came out faithful, slow drift, moving water.

## Port arrivals (Klein with two references, then LTX)

The Lisbon arrival (2026-11-20) worked first time:
1. Klein, 1280x720, two ReferenceLatent references chained on both the positive and the empty
   negative (as Warp Miner's queue_redo10.py): the port's picture (scaled 1024x576) and the ship
   still (768x768). Here, copying the references closely is what we want: the town stays exact
   and our ship is put into it. Prompt: "The harbour of Lisbon in 1451, exactly as in the first
   reference picture ... The caravel from the second reference picture ... is sailing in from the
   left on the calm river in front of the town, under sail, seen from the side, about a quarter of
   the picture wide, with a small white wake behind her. Wide cinematic view from the water, the
   camera level and steady." Seed 333 was the best of four.
2. LTX-2.5 Image to Video from that frame, 736x416, 4 s: "The small wooden caravel ... sails
   slowly from left to right across the calm river ... The castle, the cathedral and the town stay
   perfectly still. The camera is fixed and steady." About 2 minutes. The town holds still; the ship
   crosses with her wake.
In game: art/clips/lisbon_arrival.ogv (Theora, which Godot plays natively).

Lesson from the first Lisbon arrival: the ship sailed BACKWARDS. The ship still had her bow to the
left (as all our ship stills), Klein kept that, and LTX moved her left to right, stern first and a
little sideways. Next time: say which way she points AND which way she moves, and make them the
same: "bow pointing to the right, sailing to the right", or keep bow-left and sail her right to
left. Check the first frame's bow before animating. A side-on hull also crabs less than a
three-quarter one when LTX moves it across the frame.
