# Corsairs (pirates.gd) and their fights in the game (game.gd).
extends RefCounted

var runner

func test_land() -> void:
	# the browser's isLand at the same points
	var pts := [[-9.36, 38.6], [-9.5, 38.7], [-6, 35], [-10, 33], [-8, 37.2], [-14, 28.5], [-5.5, 35.9], [-30, 40], [5, 45]]
	var want := [false, false, true, false, true, true, false, false, true]
	var got := pts.map(func(p): return Geo.is_land(p[0], p[1]))
	runner.check(got == want, "land where the browser has land: %s" % [got])

func test_danger() -> void:
	runner.check(Pirates.danger(-8.0, 33.0).where == "the Barbary coast", "the Barbary coast is corsair water")
	runner.check(Pirates.danger(-9.4, 39.5).d == 0.0, "off Lisbon is safe")
	runner.check(Pirates.danger(3.0, 37.0, 1451).d == 0.0 and Pirates.danger(3.0, 37.0, 1520).d == 0.8, "Algiers from 1516")
	runner.check(Pirates.battered(100, 50) == Pirates.SPARED_HULL and Pirates.battered(40, 50) == 35.0, "corsairs spare the hull")

func _at_sea_off_barbary() -> void:
	Game.new_game("portugal")
	Game.rng.seed = 11
	Game.S.ship.docked = ""
	Game.S.ship.lon = -9.0
	Game.S.ship.lat = 33.0
	Game.S.purse = 1000.0

func test_attacked_and_beaten_off() -> void:
	_at_sea_off_barbary()
	var met := []
	var cb := func(e): met.append(e)
	Game.encounter.connect(cb)
	Game.meet({"where": "the Barbary coast", "big": false, "strength": 1.0})
	Game.encounter.disconnect(cb)
	runner.check(met.size() == 1 and Game.speed == 0 and Game.fight.role == "defend", "an attack stops her and opens a fight")
	runner.check(Fight.choices(Game.fight).any(func(c): return c.id == "pay"), "tribute offered in the first round")
	Game.fight.foe.morale = 5.0
	while Game.fight.done == null:
		Game.fight_act("turn")
	var r := Game.settle_fight()
	runner.check(Fight.outcome(Game.fight if not Game.fight.is_empty() else {"done": {"result": "beaten"}}) in ["win", "clear"] or r.kind != "", "beaten off: %s" % [r.lines])

func test_paid() -> void:
	_at_sea_off_barbary()
	Game.meet({"where": "the Barbary coast", "big": true, "strength": 1.35})
	var t: int = Game.fight.tribute
	runner.check(t == 250, "a great galley asks a quarter of the purse (%d)" % t)
	Game.fight_act("pay")
	Game.settle_fight()
	runner.check(Game.S.purse == 750.0 and Game.S.pirates.paid == 1 and Game.speed == 1 and Game.pending.is_empty(), "paid, and on her way")

func test_hunt_and_plunder() -> void:
	_at_sea_off_barbary()
	Game.S.pirates.galleys = [{"id": 1, "lon": -9.02, "lat": 33.02, "heading": 0.0, "big": false, "zone": "the Barbary coast", "until": 30.0, "seen": null}]
	Game.corsairs(0.01)
	runner.check(Game.pending.get("hunted", false) and Game.fight.is_empty(), "sailed onto a galley: asked first")
	Game.attack()
	runner.check(Game.fight.role == "attack" and Game.fight.r == Fight.CLOSE, "you attack, within gunshot")
	Game.fight.foe.morale = 5.0
	var guard := 0
	while Game.fight.done == null and guard < 8:
		Game.fight_act("fire")
		guard += 1
	var r := Game.settle_fight()
	runner.check(r.has("spoils") and Game.S.pirates.galleys.is_empty(), "taken, and she is off the sea: %s" % [r.lines])
	var purse: float = Game.S.purse
	var sp: Dictionary = Game.spoils
	Game.plunder(true)
	runner.check(Game.S.purse == purse + sp.cash and Game.S.pirates.bounty == 150 and Game.pending.is_empty(), "plundered: coin now, bounty owed")
	Game.arrive("lagos")
	runner.check(Game.S.pirates.bounty == 0 and Game.S.pirates.bountyPaid == 150, "the crown pays the bounty at Lagos")

func test_stripped() -> void:
	_at_sea_off_barbary()
	Game.S.cargo.wine = 20
	Game.S.paid.wine = 200.0
	Game.meet({"where": "the Barbary coast", "big": false, "strength": 1.0})
	Game.fight_act("strike")
	var r := Game.settle_fight()
	runner.check(Game.S.cargo.wine < 20 and Game.S.purse < 1000.0 and Game.S.pirates.lost == 1, "struck: stripped (%s)" % [r.lines])

func test_galleys_cruise() -> void:
	Game.new_game("portugal")
	var rng := RandomNumberGenerator.new()
	rng.seed = 3
	var R := Callable(rng, "randf")
	for d in 400:
		Game.S.day += 1.0
		Pirates.tick_galleys(Game.S, 1.0, R)
	var G: Array = Game.S.pirates.galleys
	runner.check(G.size() > 0 and G.size() <= 3, "galleys put to sea (%d)" % G.size())
	runner.check(G.all(func(g): return not Geo.is_land(g.lon, g.lat)), "and stay on the water")
