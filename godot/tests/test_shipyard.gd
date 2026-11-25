# The shipyard (shipyard.gd) against the browser's rules (tests/tools/yard_fixtures.mjs), and the
# yard's actions in the game (game.gd).
extends RefCounted

var runner

func _state(nation: String, year: int, standing) -> Dictionary:
	var S := {"nation": nation, "day": float(Calendar.day_of_year(year) + 40), "purse": 5000.0, "hull": 100.0,
		"ship": {"hull": "caravel", "fit": Data.default_fit.duplicate(), "docked": "seville" if nation == "castile" else "lisbon", "built": float(Calendar.day_of_year(year) - 2 * 365), "tropic": 30.0},
		"yard": {"orders": [], "built": 0}}
	if standing != null:
		S.contracts = {"unlocked": true, "standing": standing}
	return S

func test_parity() -> void:
	var fx: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/yard_fixtures.json"))
	var bad := 0
	for a in fx.avail:
		var S := _state(a.nation, int(a.year), a.standing)
		var parts: PackedStringArray = String(a.thing).split(":")
		var thing: Dictionary = Data.hulls[parts[1]] if parts[0] == "HULL" else Ships.choice(parts[0], parts[1])
		var r := Shipyard.availability(S, thing)
		if r.ok != a.r.ok or r.why != a.r.why:
			if bad < 4:
				runner.check(false, "%s %d %s %s: %s | want %s" % [a.nation, a.year, a.standing, a.thing, r, a.r])
			bad += 1
	runner.check(bad == 0, "%d of %d availabilities as the browser" % [fx.avail.size() - bad, fx.avail.size()])
	bad = 0
	for p in fx.prices:
		if Shipyard.price_for(p.hull, Ships.choice(p.g, p.c)) != int(p.p):
			bad += 1
	runner.check(bad == 0, "every price as the browser (%d wrong)" % bad)
	bad = 0
	for v in fx.values:
		if Shipyard.hull_value(v.hull, float(v.years), int(v.rep)) != int(v.v):
			bad += 1
	runner.check(bad == 0, "part-exchange values as the browser (%d wrong)" % bad)
	bad = 0
	for q in fx.quotes:
		var S := _state("portugal", int(q.year), 25)
		S.ship.hull = q.hull
		S.ship.fit = Ships.normal_fit(q.hull, {})
		var fit: Dictionary = S.ship.fit.duplicate()
		fit.merge(q.draft, true)
		var got := Shipyard.quote_fit(S, fit)
		var want: Dictionary = q.q
		var same := false
		if want.has("error"):
			same = got.error == want.error
		else:
			var lines: Array = got.lines.map(func(l): return [l.g.id, l.c.id, l.price, l.get("order", false)])
			same = got.error == "" and got.cost == int(want.cost) and got.days == int(want.days) and got.down == int(want.down) and str(lines) == str(want.lines.map(func(l): return [l[0], l[1], int(l[2]), l[3]]))
		if not same:
			if bad < 4:
				runner.check(false, "%s %d %s: %s | want %s" % [q.hull, q.year, q.draft, got, want])
			bad += 1
	runner.check(bad == 0, "%d of %d refit quotes as the browser" % [fx.quotes.size() - bad, fx.quotes.size()])

# The yard's better things need standing with the crown's factors (contracts, not yet in Godot).
func _known() -> void:
	Game.S.contracts = {"unlocked": true, "standing": 25}

func test_refit() -> void:
	Game.new_game("portugal")
	_known()
	Game.S.purse = 2000.0
	runner.check(Game.yard_here() == "lisbon" and Game.home_yard(), "Lisbon's yard")
	runner.check(Game.S.ship.name == "São Cristóvão", "the flagship has her name")
	var draft: Dictionary = Game.S.ship.fit.duplicate()
	draft.guns = "bercos"
	var q := Shipyard.quote_fit(Game.S, draft)
	var day: float = Game.S.day
	runner.check(Game.commission(draft), "commissioned: %s" % [q])
	runner.check(Game.S.ship.fit.guns == "bercos" and absf(Game.S.day - day - q.days) < 1e-6, "she has her guns, and the days passed")
	runner.check(Ships.stats(Game.S.ship).fight > Ships.stats({"hull": "barca"}).fight, "and fights better for it")
	runner.check(not Game.commission(Game.S.ship.fit), "nothing to change, nothing done")

func test_trade_up_and_fight() -> void:
	Game.new_game("portugal")
	_known()
	Game.S.purse = 5000.0
	var net := Game.trade_up_price("caravel")
	runner.check(net > 0 and net < int(Data.hulls.caravel.price), "the barca goes in part exchange (%d to pay)" % net)
	runner.check(Game.trade_up("caravel", "Bom Jesus"), "traded up")
	runner.check(Game.S.ship.hull == "caravel" and Game.S.ship.name == "Bom Jesus" and Game.S.purse == 5000.0 - net and Game.S.ship.built == Game.S.day, "a new caravel, renamed")
	var you := Fight.your_side(Game.S.ship, Game.S.hull, 0)
	runner.check(you.men > Fight.your_side({"hull": "barca"}, 100.0, 0).men, "a bigger crew for the fights")
	runner.check(not Game.trade_up("nau"), "no nau in 1451")

func test_order_and_deliver() -> void:
	Game.new_game("portugal")
	Game.S.contracts = {"unlocked": true, "standing": 45}
	Game.S.purse = 20000.0
	var target := ""
	for id in Data.nations.portugal.ladder:
		if Shipyard.availability(Game.S, Data.hulls[id]).ok == "order":
			target = id
			break
	if target == "":
		# nothing to order in 1451: move on to a year where something is
		for y in range(1452, 1520):
			Game.S.day = float(Calendar.day_of_year(y) + 10)
			for id in Data.nations.portugal.ladder:
				if Shipyard.availability(Game.S, Data.hulls[id]).ok == "order":
					target = id
					break
			if target != "":
				break
	runner.check(target != "", "a hull to order")
	if target == "":
		return
	var purse: float = Game.S.purse
	runner.check(Game.order_hull(target, "Santa Luzia"), "ordered a %s" % target)
	runner.check(Game.S.purse < purse and Game.S.yard.orders.size() == 1, "a third down")
	runner.check(not Game.deliver(0), "not ready yet")
	Game.S.day = float(Game.S.yard.orders[0].due) + 1
	runner.check(Game.deliver(0), "taken delivery")
	runner.check(Game.S.ship.hull == target and Game.S.ship.name == "Santa Luzia" and Game.S.yard.orders.is_empty(), "she is the flagship now")

func test_castile_and_foreign() -> void:
	Game.new_game("castile")
	runner.check(Game.here() == "palos" and Game.yard_here() == "palos" and not Game.home_yard(), "Castile starts at Palos, where ships are refitted, not built")
	runner.check(Shipyard.hulls_here(Game.S, "seville").has("naovizcaina") and not Shipyard.hulls_here(Game.S, "lisbon").has("naovizcaina"), "the nao vizcaína is Castile's")
	runner.check(not Shipyard.hulls_here(Game.S, "bruges").is_empty(), "Bruges sells its own holks")

func test_standing_gates() -> void:
	Game.new_game("portugal")
	Game.S.purse = 5000.0
	runner.check(not Game.trade_up("caravel"), "no caravel for a house nobody knows")
	var draft: Dictionary = Game.S.ship.fit.duplicate()
	draft.cloth = "linen"
	runner.check(Game.commission(draft), "but new sails, yes")
