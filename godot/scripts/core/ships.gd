# Ships: hulls, the shipyard's options, and what they do to a ship's sailing, hold and fighting
# (as ships.js). A ship is {hull, fit}: hull is a key of Data.hulls, fit maps each option group to
# its chosen choice.
class_name Ships
extends RefCounted

static func hull_of(ship: Dictionary) -> Dictionary:
	return Data.hulls.get(ship.get("hull", ""), Data.hulls.caravel)

static func group(id: String) -> Dictionary:
	for g in Data.groups:
		if g.id == id:
			return g
	return {}

static func choice(gid: String, cid: String) -> Dictionary:
	for c in group(gid).get("choices", []):
		if c.id == cid:
			return c
	return {}

static func groups_for(hull_id: String) -> Array:
	return Data.groups.filter(func(g): return not g.has("hulls") or hull_id in g.hulls)

static func choices_for(g: Dictionary, hull_id: String) -> Array:
	return g.choices.filter(func(c): return not c.has("hulls") or hull_id in c.hulls)

static func normal_fit(hull_id: String, fit: Dictionary) -> Dictionary:
	var out := {}
	var mine := groups_for(hull_id)
	for g in Data.groups:
		var want = fit.get(g.id)
		var ok := choices_for(g, hull_id).any(func(c): return c.id == want)
		out[g.id] = want if (g in mine and ok) else Data.default_fit[g.id]
	return out

# The sailing figures for a hull in a fit.
static func stats(ship: Dictionary) -> Dictionary:
	var h := hull_of(ship)
	var fit := normal_fit(h.id, ship.get("fit", {}))
	var st := {"hull": h.id, "name": h.name, "knots": float(h.knots), "up": float(h.up), "down": float(h.down), "offWind": 1.0,
		"hold": h.hold, "upkeep": h.upkeep, "hiredUpkeep": h.hiredUpkeep, "oars": h.get("oars", 0), "fight": float(h.get("fight", 0)),
		"spoil": 1.0, "shy": float(h.get("shy", 1)), "lure": float(h.get("lure", 1)), "peril": 1.0, "tropicWear": 1.0, "leak": 1.0, "fitWage": 0}
	var hold_factor := 1.0
	var hold_add := 0.0
	var up_add := 0.0
	for g in groups_for(h.id):
		var c := choice(g.id, fit[g.id])
		if c.is_empty():
			continue
		if c.has("knots"): st.knots *= c.knots
		if c.has("up"): st.up *= c.up
		if c.has("down"): st.down *= c.down
		if c.has("upAdd"): up_add += c.upAdd
		if c.has("offWind"): st.offWind *= c.offWind
		if c.has("hold"): hold_factor *= c.hold
		if c.has("holdAdd"): hold_add += c.holdAdd
		if c.has("wage"):
			st.upkeep += c.wage
			st.fitWage += c.wage
		if c.has("peril"): st.peril *= c.peril
		if c.has("tropicWear"): st.tropicWear *= c.tropicWear
		if c.has("leak"): st.leak *= c.leak
		if c.has("fight"): st.fight += c.fight
		if c.has("guard"): st["guard"] = st.get("guard", 0.0) + c.guard
		if c.has("spoil"): st.spoil *= c.spoil
	st.up += up_add
	st.hold = Market.js_round((h.hold + hold_add) * hold_factor)
	return st
