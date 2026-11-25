# The game in play: the state of the captain's world (S in the browser game) and the clock.
# Autoloaded as `Game`. Screens read it and call its actions; it emits signals as things happen.
extends Node

signal docked(port_id: String)
signal sailed(dest_id: String)
signal notice(text: String)
signal changed
signal encounter(enc: Dictionary)  # a corsair comes at you, or you have run one down: stop and show it
signal fight_over(result: Dictionary)
signal started  # a new game begun, or a saved one loaded: the screens start over from S

const DAYS_PER_SEC := 0.4  # at 1x: a year in about 15 minutes of sailing, as the browser game

var S: Dictionary = {}
var market: Market
var speed := 1
var speed_before_clip := 1

func _ready() -> void:
	if not load_game():
		new_game("portugal")

func new_game(nation: String) -> void:
	var home := "seville" if nation == "castile" else "lisbon"
	var p := Data.port(home)
	S = {
		"nation": nation, "day": 0.0, "purse": 300.0, "hull": 100.0, "voyages": 0,
		"ship": {"hull": "barca", "fit": {}, "name": "Esperança", "lon": p.lon, "lat": p.lat, "heading": 0.0, "route": [], "docked": home, "dest": "", "built": 0.0, "tropic": 0.0, "strain": 0.0},
		"hull_warned": 0,
		"pirates": {"notoriety": 0.0, "caution": 0.0, "cooldown": 0.0, "encounters": 0, "won": 0, "lost": 0, "fled": 0, "paid": 0, "plundered": 0, "bounty": 0, "bountyPaid": 0, "galleys": [], "galleyId": 1},
		"cargo": {}, "paid": {}, "rot": {}, "trail": [[p.lon, p.lat]],
	}
	for g in Data.good_ids:
		S.cargo[g] = 0
		S.paid[g] = 0.0
	market = Market.new()
	pending = {}
	fight = {}
	spoils = {}
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
	_autosave_clock += delta
	if _autosave_clock > AUTOSAVE_SECS and at_sea():
		save_game()
	if speed == 0 or not at_sea() or S.ship.route.is_empty() or not pending.is_empty():
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
	else:
		corsairs(used)
	changed.emit()

func pass_time(days: float) -> void:
	if at_sea():
		spoil(days)
		wear_hull(days)
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
	leak(p)
	docked.emit(port_id)
	notice.emit("Dropped anchor at %s." % p.name)
	save_game.call_deferred()
	var bounty := Pirates.collect_bounty(S, port_id)
	if bounty != "":
		notice.emit(bounty)
	for g in Pirates.port_reports(S, p):
		notice.emit("Word in %s: %s seen off %s, cruising for prey." % [p.name, "a great corsair galley" if g.big else "a corsair galley", g.zone])

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
		save_game.call_deferred()
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
	save_game.call_deferred()
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

# ---- The hull (wear.gd) ----------------------------------------------------------------------
var rng := RandomNumberGenerator.new()

func years() -> float:
	return Wear.service_years(S.ship, S.day)

# A little each day at sea, faster in the tropics; storms now and then. Word once as she starts
# to leak and once when she is in danger.
func wear_hull(dd: float) -> void:
	var st := stats()
	if S.ship.lat < Wear.TROPIC_LAT:
		S.ship.tropic += dd * float(st.tropicWear)
	if S.hull < Wear.LEAKS_BELOW:
		S.ship.strain += dd
	var gale := Wear.gale_factor(S.ship.lon, S.ship.lat, S.day)
	var storm := Wear.storms(dd, rng, gale) * float(st.peril)
	S.hull = maxf(5.0, S.hull - Wear.wear_per_day(S.ship.lat, S.ship.hull, years(), float(st.tropicWear)) * dd - storm)
	if storm > 0:
		notice.emit("%s batters the %s: her hull is at %d%%." % ["A gale" if gale > 2.5 else "A storm", S.ship.name, roundi(S.hull)])
	if S.hull < Wear.DANGER_BELOW and S.hull_warned < 2:
		S.hull_warned = 2
		notice.emit("The %s is in danger: her hull is at %d%%. Make for a shipyard, or careen her on the nearest beach." % [S.ship.name, roundi(S.hull)])
	elif S.hull < Wear.LEAKS_BELOW and S.hull_warned < 1:
		S.hull_warned = 1
		notice.emit("The %s is leaking: her hull is at %d%%, and wet cargo spoils." % [S.ship.name, roundi(S.hull)])

func has_yard() -> bool:
	return not at_sea() and Wear.YARDS.has(here())

# What putting her right costs here: the yard if there is one, else her crew on a beach.
func repair_quote() -> Dictionary:
	if has_yard():
		return Wear.yard_quote(S.ship.hull, S.hull, years())
	return Wear.beach_quote(S.ship.hull, S.hull, years())

# Pay, and the days pass in port while the work is done. False if there is nothing to do or no money.
func repair() -> bool:
	var q := repair_quote()
	if at_sea() or q.pts <= 0 or S.purse < q.cost:
		return false
	S.purse -= q.cost
	pass_time(float(q.days))
	S.hull = maxf(S.hull, float(q.to))
	S.hull_warned = 0
	save_game.call_deferred()
	notice.emit("%s in %d days for %d cz: her hull is at %d%%." % ["The shipwrights made her sound" if has_yard() else "Her crew careened her on the beach", q.days, q.cost, roundi(S.hull)])
	changed.emit()
	return true

# A leaking hull spoils cargo on the passage, counted as she makes port. What was paid stays paid.
func leak(p: Dictionary) -> void:
	var share := Wear.leak_share(S.hull, float(stats().leak))
	if share <= 0:
		return
	var lost: PackedStringArray = []
	for g in Data.goods:
		var have: int = S.cargo[g.id]
		var n := mini(have, int(Wear.js_round(have * share)))
		if n == 0:
			continue
		S.cargo[g.id] -= n
		if S.cargo[g.id] == 0:
			S.paid[g.id] = 0.0
		lost.append("%d %s of %s" % [n, g.one if n == 1 else g.unit, g.name.to_lower()])
	if not lost.is_empty():
		notice.emit("Sea water in the hold: %s ruined on the way to %s. Her hull is at %d%%." % [", ".join(lost), p.name, roundi(S.hull)])

# ---- Corsairs (pirates.gd, fight.gd) ------------------------------------------------------------
var pending: Dictionary = {}   # the encounter on screen, until it is answered
var fight: Dictionary = {}     # the fight in progress
var spoils: Dictionary = {}    # a beaten galley's plunder, until you choose
var speed_before_fight := 1

func rand() -> float:
	return rng.randf()

# Days at sea: galleys cruise, the lookout sees them, you run one down or one comes at you.
func corsairs(dd: float) -> void:
	var R := Callable(self, "rand")
	Pirates.tick_galleys(S, dd, R)
	for g in Pirates.lookout(S, S.ship.lon, S.ship.lat):
		notice.emit("Sail ho! %s off %s. Steer for her to attack." % ["A great corsair galley" if g.big else "A corsair galley", g.zone])
	var enc := Pirates.contact(S, S.ship.lon, S.ship.lat)
	if enc.is_empty():
		enc = Pirates.roll(S, dd, S.ship.lon, S.ship.lat, R)
	if not enc.is_empty():
		meet(enc)

# Stop and show it. A hunted galley asks first (attack, or let her go); an attack is a fight at once.
func meet(enc: Dictionary) -> void:
	pending = enc
	if speed != 0:
		speed_before_fight = speed
	speed = 0
	if not enc.get("hunted", false):
		fight = Pirates.start_fight(S, enc, Callable(self, "rand"))
	encounter.emit(enc)

func hunt_odds() -> Dictionary:
	return Pirates.odds(S, pending, float(wind_now().knots))

func attack() -> void:
	fight = Pirates.start_fight(S, pending, Callable(self, "rand"))
	encounter.emit(pending)

func let_go() -> void:
	Pirates.end_hunt(S, pending, "pass")
	notice.emit("You let the galley go. She pulls away toward the coast.")
	_resume()

func fight_act(id: String) -> Array:
	var lines := Fight.round_(fight, id, Callable(self, "rand"))
	changed.emit()
	return lines

func fight_auto() -> Array:
	var before: int = fight.log.size()
	Fight.autoplay(fight, Callable(self, "rand"))
	return fight.log.slice(before)

# The fight is over and the captain has read it: apply it. Returns {kind, lines, spoils?}.
func settle_fight() -> Dictionary:
	var enc := pending
	var r := Pirates.settle_fight(S, enc, fight, Callable(self, "rand"))
	if enc.get("hunted", false):
		Pirates.end_hunt(S, enc, "fought")  # beaten or not, she goes home
	for line in r.lines:
		notice.emit(line)
	spoils = r.get("spoils", {})
	if spoils.is_empty():
		_resume()
	fight_over.emit(r)
	changed.emit()
	return r

func plunder(take: bool) -> void:
	var p := Pirates.plunder(S, pending, spoils, take, free_hold())
	for line in p.lines:
		notice.emit(line)
	spoils = {}
	_resume()

func _resume() -> void:
	pending = {}
	fight = {}
	speed = speed_before_fight
	changed.emit()
	save_game()

# ---- Saving on this device (save.js) ------------------------------------------------------------
# One saved game, in user:// (on the web that is the browser's IndexedDB). Saved on making port, after
# a fight, after repairs, every half minute at sea, and when the game is closed or put away. Not in the
# middle of a fight: closed then, the game resumes from just before it. Godot's own text format keeps
# ints as ints, so the state comes back exactly as it was.
var save_path := "user://helmline.save"  # the tests use their own
const SAVE_VERSION := 1
const AUTOSAVE_SECS := 30.0
var _autosave_clock := 0.0

func has_save() -> bool:
	return FileAccess.file_exists(save_path)

func save_game() -> bool:
	_autosave_clock = 0.0
	if S.is_empty() or not pending.is_empty():
		return false
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f == null:
		return false  # storage unavailable: play on without saving
	S["savedAt"] = Time.get_unix_time_from_system()
	f.store_string(var_to_str({"version": SAVE_VERSION, "S": S, "market": market.to_dict(), "rng": rng.state, "speed": speed}))
	f.close()
	return true

# What the saved game is, for the start screen: {} if there is none.
func save_summary() -> Dictionary:
	var d := _read_save()
	if d.is_empty():
		return {}
	var s: Dictionary = d.S
	var where: String = ("in %s" % Data.port(s.ship.docked).name) if s.ship.docked != "" else "at sea"
	return {"ship": s.ship.name, "where": where, "date": Calendar.fmt_date(s.day), "purse": int(s.purse), "nation": s.nation}

func _read_save() -> Dictionary:
	if not has_save():
		return {}
	var v = str_to_var(FileAccess.get_file_as_string(save_path))
	if typeof(v) != TYPE_DICTIONARY or int(v.get("version", 0)) != SAVE_VERSION or typeof(v.get("S")) != TYPE_DICTIONARY:
		return {}
	return v

# Load the saved game. Anything the save lacks (a newer edition adds to the state) comes from a fresh
# game's state, so old saves keep working.
func load_game() -> bool:
	var d := _read_save()
	if d.is_empty():
		return false
	var saved: Dictionary = d.S
	new_game(saved.get("nation", "portugal"))
	var fresh := S
	S = _merge(fresh, saved)
	market = Market.new(d.get("market", {}))
	rng.state = int(d.get("rng", rng.state))
	speed = 1
	pending = {}
	fight = {}
	spoils = {}
	started.emit()
	changed.emit()
	return true

static func _merge(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for k in over:
		if typeof(over[k]) == TYPE_DICTIONARY and typeof(out.get(k)) == TYPE_DICTIONARY:
			out[k] = _merge(out[k], over[k])
		else:
			out[k] = over[k]
	return out

func start_new(nation: String) -> void:
	new_game(nation)
	speed = 1
	save_game()
	started.emit()

func delete_save() -> void:
	if has_save():
		DirAccess.remove_absolute(save_path)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		save_game()
