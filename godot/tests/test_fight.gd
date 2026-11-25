# Sea fights (fight.gd) against the browser's rules (tests/tools/fight_fixtures.mjs): the same
# ships, the same dice, the same rounds, the same outcome.
extends RefCounted

var runner

func test_parity() -> void:
	var fx: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fight_fixtures.json"))
	var rolls: Array = fx.rolls
	var bad := 0
	for c in fx.cases:
		var at := [int(c.start)]
		var rand := func() -> float:
			var v: float = rolls[at[0] % rolls.size()]
			at[0] += 1
			return v
		var ship: Dictionary = c.ship.duplicate(true)
		ship.name = "Test"
		var you := Fight.your_side(ship, float(c.hull), 3)
		var foe := Fight.foe_side(c.kind, 1.0 if c.kind == "warship" else 0.0)
		var F := Fight.start(you, c.role, foe, rand, {"range": int(c.opts.range), "tribute": int(c.opts.tribute), "surprise": c.opts.surprise})
		if typeof(c.policy) == TYPE_STRING:
			Fight.autoplay(F, rand)
		else:
			var i := 0
			while F.done == null and i < 12:
				var ids := Fight.choices(F).map(func(x): return x.id)
				var act := ""
				for a in c.policy:
					if ids.has(a):
						act = a
						break
				if act == "":
					act = ids[0]
				var lines := Fight.round_(F, act, rand)
				var want: Dictionary = c.steps[i]
				if act != want.act or lines != want.lines or F.r != int(want.r) or absf(F.foe.hull - want.foe.hull) > 1e-6 or absf(F.you.morale - want.you.morale) > 1e-6:
					if bad < 3:
						runner.check(false, "%s %s %s %s round %d: %s %s r%d | want %s %s r%d" % [c.ship.hull, c.kind, c.role, c.policy, i + 1, act, lines, F.r, want.act, want.lines, int(want.r)])
					bad += 1
					break
				i += 1
		var same: bool = F.done != null and c.done != null and F.done.result == c.done.result and F.log == c.log and at[0] - int(c.start) == int(c.used)
		same = same and absf(F.you.hull - c.you.hull) < 1e-6 and absf(F.foe.morale - c.foe.morale) < 1e-6
		if not same:
			if bad < 3:
				runner.check(false, "%s %s %s %s: %s %d rolls | want %s %d rolls\n  %s\n  %s" % [c.ship.hull, c.kind, c.role, c.policy, F.done, at[0] - int(c.start), c.done, int(c.used), F.log, c.log])
			bad += 1
	runner.check(bad == 0, "%d of %d fights match the browser's, roll for roll" % [fx.cases.size() - bad, fx.cases.size()])
