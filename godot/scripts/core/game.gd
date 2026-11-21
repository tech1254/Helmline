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

func _ready() -> void:
	new_game("portugal")

func new_game(nation: String) -> void:
	var home := "seville" if nation == "castile" else "lisbon"
	var p := Data.port(home)
	S = {
		"nation": nation, "day": 0.0, "purse": 300.0, "hull": 100.0, "voyages": 0,
		"ship": {"hull": "barca", "fit": {}, "name": "Esperança", "lon": p.lon, "lat": p.lat, "heading": 0.0, "route": [], "docked": home, "dest": ""},
		"cargo": {}, "paid": {}, "trail": [[p.lon, p.lat]],
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
