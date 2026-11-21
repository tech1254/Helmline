# The game in play: the state of the captain's world (S in the browser game) and the clock.
# Autoloaded as `Game`. Screens read it and call its actions; it emits signals as things happen.
extends Node

signal docked(port_id: String)
signal sailed(dest_id: String)
signal notice(text: String)
signal changed

const DAYS_PER_SEC := 0.4  # at 1x: a year in about 15 minutes of sailing, as the browser game

var S: Dictionary = {}
var market: Market
var speed := 1
var speed_before_clip := 1

func _ready() -> void:
	new_game("portugal")

func new_game(nation: String) -> void:
	var home := "seville" if nation == "castile" else "lisbon"
	var p := Data.port(home)
	S = {
		"nation": nation, "day": 0.0, "purse": 300.0, "hull": 100.0, "voyages": 0,
		"ship": {"hull": "barca", "fit": {}, "name": "Esperança", "lon": p.lon, "lat": p.lat, "heading": 0.0, "route": [], "docked": home, "dest": ""},
		"cargo": {}, "paid": {}, "rot": {}, "trail": [[p.lon, p.lat]],
	}
	for g in Data.good_ids:
		S.cargo[g] = 0
		S.paid[g] = 0.0
	market = Market.new()
	changed.emit()

func stats() -> Dictionary:
	return Ships.stats(S.ship)

func here() -> String:
	return S.ship.docked

func at_sea() -> bool:
	return S.ship.docked == ""

# The course to a port from where she lies, with the passage estimated in today's winds.
func plan_to(port_id: String) -> Dictionary:
	var from: String = S.ship.docked
	var st := stats()
	var coastal: bool = Ships.hull_of(S.ship).get("coastal", false)
	var r = Nav.port_route(from, port_id, 0.5, coastal) if from != "" else null
	if r == null:
		return {}
	var est := Voyage.estimate(st, r, S.ship.lon, S.ship.lat, S.day, S.hull)
	return {"to": port_id, "route": r, "days": est.days, "nm": est.nm, "cost": est.cost}

func set_sail(plan: Dictionary) -> void:
	if plan.is_empty():
		return
	S.ship.route = plan.route.duplicate(true)
	S.ship.dest = plan.to
	S.ship.docked = ""
	sailed.emit(plan.to)
	changed.emit()

func _process(delta: float) -> void:
	if speed == 0 or not at_sea() or S.ship.route.is_empty():
		return
	advance(delta * DAYS_PER_SEC * speed)

# Days pass at sea: she sails her course, the markets move, and she arrives.
func advance(days: float) -> void:
	var st := stats()
	var used := Voyage.step(S.ship, st, S.day, days, S.hull)
	pass_time(used)
	var last: Array = S.trail[-1]
	if absf(last[0] - S.ship.lon) + absf(last[1] - S.ship.lat) > 0.12:
		S.trail.append([S.ship.lon, S.ship.lat])
	if S.ship.route.is_empty() and S.ship.dest != "":
		arrive(S.ship.dest)
	changed.emit()

func pass_time(days: float) -> void:
	if at_sea():
		spoil(days)
	S.day += days
	market.tick(days)
	S.purse -= days * stats().upkeep  # the crew's wages, by the day

func arrive(port_id: String) -> void:
	var p := Data.port(port_id)
	S.ship.docked = port_id
	S.ship.dest = ""
	S.ship.lon = p.lon
	S.ship.lat = p.lat
	S.voyages += 1
	docked.emit(port_id)
	notice.emit("Dropped anchor at %s." % p.name)

# Wind and point of sail where she is, for the screens.
func wind_now() -> Dictionary:
	return Wind.ship_wind(stats(), S.ship.lon, S.ship.lat, S.ship.heading, S.day, Voyage.hull_factor(S.hull))

# ---- Trade ---------------------------------------------------------------------

func held() -> int:
	var n := 0
	for g in Data.good_ids:
		n += int(S.cargo[g])
	return n

func free_hold() -> int:
	return maxi(0, int(stats().hold) - held())

# Buy up to n of a good here. Returns the number bought.
func buy(good: String, n: int) -> int:
	var port := here()
	if port == "" or market.closed(port):
		return 0
	var r := market.buy(port, good, n, S.purse, free_hold())
	if r.bought > 0:
		S.purse -= r.cost
		S.cargo[good] += r.bought
		S.paid[good] += r.cost
		changed.emit()
	return r.bought

# Sell up to n of a good here. Returns the income.
func sell(good: String, n: int) -> int:
	var port := here()
	n = mini(n, int(S.cargo[good]))
	if port == "" or n <= 0:
		return 0
	var have: int = S.cargo[good]
	var r := market.sell(port, good, n)
	S.purse += r.income
	S.paid[good] = S.paid[good] * (have - n) / have if have > n else 0.0
	S.cargo[good] = have - n
	changed.emit()
	return r.income

# What a unit of a good in the hold cost her, on average.
func avg_paid(good: String) -> float:
	return S.paid[good] / S.cargo[good] if S.cargo[good] > 0 else 0.0

# Perishable cargo slowly spoils at sea, faster in the tropics.
func spoil(dd: float) -> void:
	var heat: float = (1.6 if S.ship.lat < 26 else 1.0) * float(stats().spoil)
	for g in Data.goods:
		var have: int = S.cargo[g.id]
		if have == 0 or g.spoil == 0:
			continue
		S.rot[g.id] = S.rot.get(g.id, 0.0) + have * g.spoil * heat * dd
		var lost := 0
		while S.rot[g.id] >= 1.0 and S.cargo[g.id] > 0:
			S.rot[g.id] -= 1.0
			S.cargo[g.id] -= 1
			lost += 1
		if lost > 0:
			S.paid[g.id] = S.paid[g.id] * S.cargo[g.id] / have
			notice.emit("%d %s of %s %s." % [lost, g.one if lost == 1 else g.unit, g.name.to_lower(), g.rot])
		if S.cargo[g.id] == 0:
			S.rot[g.id] = 0.0
			S.paid[g.id] = 0.0
