# The reactive market, as in the browser game (economy.js). Each port has a base price per
# good. Trading pushes the price (buying raises it, selling lowers it) and that pressure fades
# over weeks. Prices also drift slowly on their own, so old information goes stale.
class_name Market
extends RefCounted

var press: Dictionary = {}    # port -> good -> trade pressure
var drift: Dictionary = {}    # port -> good -> log-price drift
var effects: Dictionary = {}  # port -> good -> event multiplier
var rival: Dictionary = {}    # port -> good -> rival-merchant multiplier
var closed_ports: Dictionary = {}
var edge: Dictionary = {}     # port -> standing bonus
var scale: Dictionary = {}    # port -> depth scale from the port's size
var vol: Dictionary = {}      # port -> units traded
var volg: Dictionary = {}     # port -> good -> units traded
var rng := RandomNumberGenerator.new()

func _init(saved: Dictionary = {}, seed_value: int = -1) -> void:
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()
	for port in Data.markets:
		press[port] = {}
		drift[port] = {}
		for g in Data.good_ids:
			press[port][g] = saved.get("press", {}).get(port, {}).get(g, 0.0)
			drift[port][g] = saved.get("drift", {}).get(port, {}).get(g, gauss() * 0.06)

func to_dict() -> Dictionary:
	return {"press": press, "drift": drift}

func gauss() -> float:
	return rng.randfn(0.0, 1.0)

func sells(port: String, good: String) -> bool:
	var e: Array = Data.markets[port].p[good]
	return e.size() > 1 and bool(e[1])

func k(port: String, good: String) -> float:
	var m := 1.0
	if good == "gold":
		m = Data.economy.goldK
	elif good == "spices":
		m = Data.economy.spiceK
	return Data.markets[port].k * Data.economy.depth * m * scale.get(port, 1.0)

func base_price(port: String, good: String) -> float:
	return Data.markets[port].p[good][0]

func mid(port: String, good: String) -> float:
	var ev: float = effects.get(port, {}).get(good, 1.0)
	var rv: float = rival.get(port, {}).get(good, 1.0)
	return base_price(port, good) * ev * rv * exp(drift[port][good] - k(port, good) * press[port][good])

func closed(port: String) -> bool:
	return closed_ports.has(port)

# Prices round half up, as JavaScript's Math.round does.
static func js_round(x: float) -> int:
	return int(floor(x + 0.5))

func buy_price(port: String, good: String) -> int:
	return maxi(1, js_round(mid(port, good) * (1.0 + Data.economy.spread) * (1.0 - edge.get(port, 0.0))))

func sell_price(port: String, good: String) -> int:
	return maxi(1, js_round(mid(port, good) * (1.0 - Data.economy.spread) * (1.0 + edge.get(port, 0.0))))

func _count(port: String, good: String, n: int) -> void:
	if n == 0:
		return
	vol[port] = vol.get(port, 0) + n
	if not volg.has(port):
		volg[port] = {}
	volg[port][good] = volg[port].get(good, 0) + n

# Buy up to n units, limited by purse and free hold space. Each unit costs a bit more.
func buy(port: String, good: String, n: int, purse: float, free: int) -> Dictionary:
	var bought := 0
	var cost := 0
	if not sells(port, good):
		return {"bought": 0, "cost": 0}
	while bought < n and bought < free:
		var price := buy_price(port, good)
		if cost + price > purse:
			break
		cost += price
		press[port][good] -= 0.5  # producers have deep stocks
		bought += 1
	_count(port, good, bought)
	return {"bought": bought, "cost": cost}

func sell(port: String, good: String, n: int) -> Dictionary:
	var income := 0
	for i in n:
		income += sell_price(port, good)
		press[port][good] += 1.0
	_count(port, good, n)
	return {"sold": n, "income": income}

func tick(days: float) -> void:
	var decay: float = exp(-days / float(Data.economy.pressureDays))
	var pull: float = days / float(Data.economy.driftDays)
	var v: float = Data.economy.driftVol * sqrt(days)
	for port in press:
		for g in Data.good_ids:
			press[port][g] *= decay
			var d: float = drift[port][g]
			drift[port][g] = clampf(d - d * pull + gauss() * v, -0.4, 0.4)

# What a captain in port can see today.
func observe(port: String) -> Dictionary:
	var out := {}
	for g in Data.good_ids:
		out[g] = {"buy": buy_price(port, g) if sells(port, g) else null, "sell": sell_price(port, g)}
	return out
