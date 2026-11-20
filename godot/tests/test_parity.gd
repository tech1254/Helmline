# The Godot rules give the same answers as the browser game's (fixtures from
# tests/tools/godot_fixtures.mjs).
extends RefCounted

var runner
var fx: Dictionary = Data.read_json("res://tests/fixtures.json")

func near(a: float, b: float, eps := 1e-6) -> bool:
	return absf(a - b) <= eps * maxf(1.0, absf(b))

func test_calendar() -> void:
	for c in fx.calendar:
		runner.check(Calendar.year_of(c.day) == int(c.year), "year_of(%s) = %s, want %s" % [c.day, Calendar.year_of(c.day), c.year])
		runner.check(Calendar.fmt_date(c.day) == c.date, "fmt_date(%s) = %s, want %s" % [c.day, Calendar.fmt_date(c.day), c.date])
	for c in fx.dayOfYear:
		runner.check(Calendar.day_of_year(int(c.year)) == int(c.day), "day_of_year(%s) = %s, want %s" % [c.year, Calendar.day_of_year(int(c.year)), c.day])

func test_market() -> void:
	var m := Market.new({}, 1)
	for p in m.drift:
		for g in m.drift[p]:
			m.drift[p][g] = 0.0
	for p in fx.marketDrift:
		for g in fx.marketDrift[p]:
			m.drift[p][g] = fx.marketDrift[p][g]
	for s in fx.market:
		if s.has("look"):
			var got := m.observe(s.look)
			for g in s.prices:
				var want = s.prices[g]
				runner.check(got[g].sell == int(want.sell), "%s %s sell %s, want %s" % [s.look, g, got[g].sell, want.sell])
				runner.check((got[g].buy == null and want.buy == null) or (want.buy != null and got[g].buy == int(want.buy)), "%s %s buy %s, want %s" % [s.look, g, got[g].buy, want.buy])
		elif s.has("buy"):
			var a: Array = s.buy
			var r := m.buy(a[0], a[1], int(a[2]), float(a[3]), int(a[4]))
			runner.check(r.bought == int(s.res.bought) and r.cost == int(s.res.cost), "buy %s: %s, want %s" % [a, r, s.res])
		elif s.has("sell"):
			var a: Array = s.sell
			var r := m.sell(a[0], a[1], int(a[2]))
			runner.check(r.income == int(s.res.income), "sell %s: %s, want %s" % [a, r, s.res])

func test_ship_stats() -> void:
	for c in fx.ships:
		var got := Ships.stats({"hull": c.hull, "fit": c.fit})
		for k in c.stats:
			var want = c.stats[k]
			var ok: bool = (near(float(got.get(k, -1)), float(want))) if (typeof(want) == TYPE_FLOAT or typeof(want) == TYPE_INT) else str(got.get(k)) == str(want)
			runner.check(ok, "%s %s %s = %s, want %s" % [c.hull, c.fit, k, got.get(k), want])

func test_distances() -> void:
	for c in fx.dist:
		runner.check(near(Geo.port_dist(c.a, c.b), c.nm), "%s-%s %s nm, want %s" % [c.a, c.b, Geo.port_dist(c.a, c.b), c.nm])
