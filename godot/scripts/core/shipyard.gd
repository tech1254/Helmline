# The shipyard's rules (port of the yard half of public/js/ships.js): what fittings and hulls cost,
# whether they can be had yet (by year, by the house's standing, by which yards build them), a quote
# for a refit, trading the flagship up for a new hull, and orders for things not yet built.
# The house's home yard (Lisbon, Seville) builds ships; the other yards refit; the northern yards
# sell their own holks.
class_name Shipyard
extends RefCounted

static func nation(S: Dictionary) -> Dictionary:
	return Data.nations.get(S.get("nation", "portugal"), Data.nations.portugal)

static func home(S: Dictionary) -> String:
	return nation(S).home

static func is_yard(port_id: String) -> bool:
	return Wear.YARDS.has(port_id) or Data.foreign_yards.has(port_id)

static func year_of(S: Dictionary) -> int:
	return Calendar.year_of(S.day)

# The house's standing with the crown's factors (contracts): none until contracts are open.
static func standing_of(S: Dictionary) -> float:
	var c: Dictionary = S.get("contracts", {})
	return float(c.get("standing", 0)) if c.get("unlocked", false) else -INF

static func price_for(hull_id: String, c: Dictionary) -> int:
	return int(Market.js_round(float(c.get("price", 0)) * Data.price_rise * float(Data.hulls[hull_id].scale) / 10.0)) * 10

static func _is_hull(thing: Dictionary) -> bool:
	return thing.has("draft") and Data.hulls.get(thing.get("id", "")) != null and Data.hulls[thing.id].name == thing.get("name")

# Whether a hull or fitting can be had now: {ok: "yes" | "order" | "no", why}.
static func availability(S: Dictionary, thing: Dictionary) -> Dictionary:
	var year := year_of(S)
	if thing.get("rival", false):
		return {"ok": "no", "why": "not for sale"}
	if thing.has("foreign"):
		if thing.has("until") and year >= int(thing.until):
			return {"ok": "no", "why": "no longer built: the urca has taken her place"}
		if not thing.foreign.has(S.ship.docked):
			return {"ok": "no", "why": "built only in the yards of %s" % ", ".join(PackedStringArray(thing.foreign.map(func(p): return String(p).capitalize())))}
	elif _is_hull(thing):
		var N := nation(S)
		if not N.ladder.has(thing.id):
			return {"ok": "no", "why": "not built in %s's yards" % N.name}
		var over: Dictionary = N.years.get(thing.id, {})
		if not over.is_empty():
			thing = thing.duplicate()
			thing.merge(over, true)
			if not over.has("orderYear"):
				thing.erase("orderYear")
	var need := float(thing.get("standing", 0))
	if need and standing_of(S) < need:
		return {"ok": "no", "why": "needs standing: %s" % Data.tier_names.get(str(int(need)), "more")}
	if thing.has("year") and year < int(thing.year):
		if thing.has("orderYear") and year >= int(thing.orderYear):
			return {"ok": "order", "why": "can be ordered now for delivery in %d" % thing.year}
		return {"ok": "no", "why": ("can be ordered from %d, delivered in %d" % [thing.orderYear, thing.year]) if thing.has("orderYear") else "from %d" % thing.year}
	return {"ok": "yes", "why": ""}

# What a set of changes from the current fit costs, and the days in the yard.
static func quote_fit(S: Dictionary, fit: Dictionary) -> Dictionary:
	var sh: Dictionary = S.ship
	var cur := Ships.normal_fit(sh.hull, sh.get("fit", {}))
	var lines := []
	var cost := 0
	var days := 0
	var ordered := []
	for g in Ships.groups_for(sh.hull):
		if not fit.has(g.id) or fit[g.id] == cur[g.id]:
			continue
		var c := Ships.choice(g.id, fit[g.id])
		var av := availability(S, c)
		var price := price_for(sh.hull, c)
		if av.ok == "no":
			return {"error": "%s: %s." % [c.name, av.why], "lines": [], "cost": 0, "days": 0, "ordered": [], "down": 0}
		if av.ok == "order":
			ordered.append({"group": g.id, "choice": c.id, "price": price})
			lines.append({"g": g, "c": c, "price": price, "order": true})
			continue
		cost += price
		days = maxi(days, int(c.get("days", 0)))
		lines.append({"g": g, "c": c, "price": price})
	var done := lines.filter(func(l): return not l.get("order", false)).size()
	if done > 1:
		days += done - 1  # the yard works on several things at once, but each extra job adds a day
	var down := 0
	for o in ordered:
		down += int(Market.js_round(o.price / 3.0))
	return {"lines": lines, "cost": cost, "days": days, "ordered": ordered, "down": down, "error": ""}

# Apply a refit that has been paid for. Ordered items are kept for later.
static func apply_fit(S: Dictionary, q: Dictionary) -> void:
	var sh: Dictionary = S.ship
	sh.fit = Ships.normal_fit(sh.hull, sh.get("fit", {}))
	for l in q.lines:
		if not l.get("order", false):
			sh.fit[l.g.id] = l.c.id
	for o in q.ordered:
		var c := Ships.choice(o.group, o.choice)
		S.yard.orders.append({"kind": "fit", "group": o.group, "choice": o.choice, "price": o.price, "paid": int(Market.js_round(o.price / 3.0)), "due": Calendar.day_of_year(int(c.year)), "placed": S.day})

# ---- Hulls ---------------------------------------------------------------------------------

# The hulls this yard sells: the house's own at home, a northern yard's own abroad.
static func hulls_here(S: Dictionary, port_id: String) -> Array:
	if port_id == home(S):
		return Array(nation(S).ladder)
	if Data.foreign_yards.has(port_id):
		return Data.hulls.values().filter(func(h): return h.has("foreign") and h.foreign.has(port_id)).map(func(h): return h.id)
	return []

static func life_share(hull_id: String, years: float) -> float:
	return years / float(Data.hulls.get(hull_id, Data.hulls.caravel).get("life", 15))

# What a yard gives for a hull in part exchange: half her price new, less as she ages, less repairs.
static func hull_value(hull_id: String, years: float, repair_cost := 0) -> int:
	var f := maxf(0.1, 1 - 0.9 * minf(1.0, life_share(hull_id, years)))
	return maxi(0, int(Market.js_round(float(Data.hulls.get(hull_id, Data.hulls.caravel).price) / 2.0 * f - repair_cost)))

static func trade_in_value(S: Dictionary) -> int:
	var years := Wear.service_years(S.ship, S.day)
	var repair: int = Wear.yard_quote(S.ship.hull, S.hull, years).cost
	return hull_value(S.ship.hull, years, repair)

# Replace the flagship with a new hull. Fittings stay with the old ship, except her colours.
static func trade_up(S: Dictionary, hull_id: String, ship_name := "") -> void:
	var sh: Dictionary = S.ship
	var keep := {}
	var cur := Ships.normal_fit(sh.hull, sh.get("fit", {}))
	for g in Data.groups:
		if g.get("cosmetic", false):
			keep[g.id] = cur[g.id]
	sh.hull = hull_id
	sh.fit = Ships.normal_fit(hull_id, keep)
	if ship_name != "":
		sh.name = ship_name
	sh.built = S.day
	sh.tropic = 0.0
	sh.strain = 0.0
	sh.rebuilt = 0
	S.hull = 100.0
	S.hull_warned = 0
	S.yard.built = int(S.yard.get("built", 0)) + 1

static func order_hull(S: Dictionary, hull_id: String, ship_name := "") -> int:
	var h: Dictionary = Data.hulls[hull_id]
	var year := int(nation(S).years.get(hull_id, {}).get("year", h.year))
	var paid := int(Market.js_round(float(h.price) / 3.0))
	S.yard.orders.append({"kind": "hull", "hull": hull_id, "name": ship_name, "price": int(h.price), "paid": paid, "due": Calendar.day_of_year(year), "placed": S.day})
	return paid

static func ready(S: Dictionary) -> Array:
	return S.yard.orders.filter(func(o): return S.day >= o.due)

static func has_order(S: Dictionary, kind: String, id: String) -> bool:
	return S.yard.orders.any(func(o): return o.kind == kind and (o.get("hull") == id or o.get("choice") == id))

static func progress(S: Dictionary, o: Dictionary) -> float:
	return clampf((S.day - o.placed) / maxf(1.0, o.due - o.placed), 0.0, 1.0)

static func stage_text(p: float) -> String:
	if p >= 1:
		return "ready for delivery"
	if p < 0.2:
		return "the keel is laid"
	if p < 0.45:
		return "her frames are up"
	if p < 0.7:
		return "she is being planked"
	if p < 0.9:
		return "her masts are stepped"
	return "she is being rigged"
