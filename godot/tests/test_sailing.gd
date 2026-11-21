# Winds, sailing speeds and passage times match the browser game's.
extends RefCounted

var runner
var fx: Dictionary = Data.read_json("res://tests/fixtures.json")

func near(a: float, b: float, eps := 1e-6) -> bool:
	return absf(a - b) <= eps * maxf(1.0, absf(b))

func test_wind() -> void:
	for c in fx.wind:
		var w := Wind.at(c.lon, c.lat, c.day)
		runner.check(near(w.from, c.w.from, 1e-5) and near(w.strength, c.w.strength), "wind at %s,%s day %s: %s, want %s" % [c.lon, c.lat, c.day, w, c.w])

func test_sail_factor() -> void:
	for c in fx.sail:
		runner.check(near(Wind.sail_factor(c.off), c.f), "sail_factor(%s)" % c.off)

func test_knots() -> void:
	for c in fx.knots:
		var st := Ships.stats({"hull": c.hull, "fit": {}})
		runner.check(near(Wind.knots_at(st, c.off, c.f, 0.9), c.k), "%s at %s: %s, want %s" % [c.hull, c.off, Wind.knots_at(st, c.off, c.f, 0.9), c.k])

func test_passages() -> void:
	for c in fx.passages:
		var st := Ships.stats({"hull": c.hull, "fit": {}})
		var A := Data.port(c.a)
		var e := Voyage.estimate(st, c.route, A.lon, A.lat, c.day)
		runner.check(near(e.days, c.est.days, 1e-4) and near(e.nm, c.est.nm, 1e-4) and int(e.cost) == int(c.est.cost), "%s-%s %s: %s, want %s" % [c.a, c.b, c.hull, e, c.est])

func test_step_arrives() -> void:
	var c: Dictionary = fx.passages[0]
	var st := Ships.stats({"hull": c.hull, "fit": {}})
	var A := Data.port(c.a)
	var ship := {"lon": A.lon, "lat": A.lat, "heading": 0.0, "route": c.route.duplicate(true)}
	var day: float = c.day
	for i in 400:
		day += Voyage.step(ship, st, day, 0.25)
		if ship.route.is_empty():
			break
	runner.check(ship.route.is_empty(), "the ship arrives")
	runner.check(absf((day - c.day) - c.est.days) < 0.3, "she takes about the estimated %s days (took %s)" % [c.est.days, day - c.day])
