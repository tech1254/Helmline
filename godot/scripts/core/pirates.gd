# Barbary corsairs (port of public/js/pirates.js): the first danger at sea. In their waters a galley
# may come at you (run, fight or pay); galleys also cruise those waters for weeks and can be hunted.
# Fighting builds notoriety (more corsairs come looking for you), avoiding fights builds caution.
# Rolls come from `rand` (a Callable returning 0..1). Later systems (callings, sea loans, forts,
# prizes at law) leave their hooks at 1 or 0 until they are ported.
class_name Pirates
extends RefCounted

const ZONES := [
	{"w": -12.5, "e": -5.2, "s": 29.5, "n": 36.2, "d": 1.0, "name": "the Barbary coast"},
	{"w": -10.2, "e": -6.0, "s": 36.0, "n": 37.6, "d": 0.6, "name": "the Algarve"},
	{"w": -18.5, "e": -12.8, "s": 27.2, "n": 29.8, "d": 0.45, "name": "the Canaries"},
	{"w": -1.5, "e": 9.5, "s": 35.8, "n": 40.5, "d": 0.8, "name": "the waters off Algiers", "from": 1516},
	{"w": 9.5, "e": 16.6, "s": 36.6, "n": 41.0, "d": 0.5, "name": "the Tyrrhenian Sea", "from": 1520},
]
const OTTOMAN_FROM := 1529
const BASE_CHANCE := 0.035
const COOLDOWN_DAYS := 12.0
const NAME_HALF_LIFE_DAYS := 5 * 365.0
const BOUNTY := {"galley": 150, "big": 300}
const PLUNDER_GOODS := ["wine", "cloth", "wheat", "alquices", "sugar", "dye"]
const PORTUGUESE_PORTS := ["lisbon", "porto", "lagos", "funchal", "ceuta", "saotome", "angra", "ribeiragrande"]
const PRIZE_FULL := 3000.0
const SPARED_HULL := Wear.LEAKS_BELOW + 2
const LEAVE_PURSE := 150.0
const CALM := 1e5  # a cooldown this long means calm seas (the tests set it): no galleys either
const GALLEYS := {"max": 3, "perDay": 0.02, "life": [20.0, 45.0], "nmPerDay": 40.0, "sightNm": 45.0, "contactNm": 8.0, "reportNm": 300.0, "surprise": 0.12}

static func ensure(S: Dictionary) -> Dictionary:
	if not S.has("pirates"):
		S.pirates = {"notoriety": 0.0, "caution": 0.0, "cooldown": 0.0, "encounters": 0, "won": 0, "lost": 0, "fled": 0, "paid": 0,
			"plundered": 0, "bounty": 0, "bountyPaid": 0, "galleys": [], "galleyId": 1}
	return S.pirates

static func zones(year: int) -> Array:
	return ZONES.filter(func(z): return not z.has("from") or year >= z.from)

static func _big_chance(S: Dictionary, P: Dictionary) -> float:
	return 0.25 + P.notoriety / 200.0 + (0.15 if Calendar.year_of(S.day) >= OTTOMAN_FROM else 0.0)

static func danger(lon: float, lat: float, year := 1451) -> Dictionary:
	var d := 0.0
	var where := ""
	for z in zones(year):
		if lon >= z.w and lon <= z.e and lat >= z.s and lat <= z.n and z.d > d:
			d = z.d
			where = z.name
	return {"d": d, "where": where}

static func attention(S: Dictionary) -> float:
	var P := ensure(S)
	return minf(2.5, maxf(0.3, 1 + P.notoriety / 25.0 - P.caution / 40.0))

static func prize(S: Dictionary) -> float:
	var cargo := 0.0
	for g in S.paid:
		cargo += float(S.paid[g])
	return minf(1.0, maxf(0.15, (maxf(0.0, S.purse) + cargo) / PRIZE_FULL))

static func battered(hull: float, dmg: float) -> float:
	if hull > SPARED_HULL:
		return maxf(SPARED_HULL, hull - dmg)
	return maxf(10.0, hull - minf(dmg, 5.0))

# Days pass at sea: maybe a galley comes at you. Returns an encounter or {}.
static func roll(S: Dictionary, days: float, lon: float, lat: float, rand: Callable) -> Dictionary:
	var P := ensure(S)
	var fade := exp(-days * log(2.0) / NAME_HALF_LIFE_DAYS)
	P.notoriety *= fade
	P.caution *= fade
	P.cooldown = maxf(0.0, P.cooldown - days)
	if P.cooldown > 0:
		return {}
	var dz := danger(lon, lat, Calendar.year_of(S.day))
	if dz.d == 0:
		return {}
	var st := Ships.stats(S.ship)
	var chance := 1 - exp(-BASE_CHANCE * dz.d * attention(S) * st.shy * st.lure * prize(S) * days)
	if rand.call() > chance:
		return {}
	P.cooldown = COOLDOWN_DAYS
	P.encounters += 1
	var big: bool = rand.call() < _big_chance(S, P)
	return {"where": dz.where, "big": big, "strength": 1.35 if big else 1.0}

# ---- Galleys at sea, to be hunted ------------------------------------------------------------

static func tick_galleys(S: Dictionary, days: float, rand: Callable) -> void:
	var P := ensure(S)
	var G: Array = P.galleys
	if P.cooldown > CALM:
		return
	for i in range(G.size() - 1, -1, -1):
		if S.day > G[i].until:
			G.remove_at(i)
	for z in zones(Calendar.year_of(S.day)):
		if G.size() >= GALLEYS.max:
			break
		if rand.call() > 1 - exp(-GALLEYS.perDay * z.d * days):
			continue
		for k in 20:
			var lon: float = z.w + rand.call() * (z.e - z.w)
			var lat: float = z.s + rand.call() * (z.n - z.s)
			if Geo.is_land(lon, lat):
				continue
			G.append({"id": P.galleyId, "lon": lon, "lat": lat, "heading": rand.call() * 360.0, "big": rand.call() < _big_chance(S, P),
				"zone": z.name, "until": S.day + GALLEYS.life[0] + rand.call() * (GALLEYS.life[1] - GALLEYS.life[0]), "seen": null})
			P.galleyId += 1
			break
	for g in G:
		var z: Dictionary = ZONES[0]
		for x in ZONES:
			if x.name == g.zone:
				z = x
		g.heading = fmod(g.heading + (-35 + rand.call() * 70) * minf(1.0, days) + 360, 360.0)
		var nm: float = GALLEYS.nmPerDay * days
		for tries in 6:
			var r := deg_to_rad(g.heading)
			var lat: float = g.lat + nm * cos(r) / 60.0
			var lon: float = g.lon + nm * sin(r) / (60.0 * cos(deg_to_rad(g.lat)))
			if lon >= z.w and lon <= z.e and lat >= z.s and lat <= z.n and not Geo.is_land(lon, lat):
				g.lon = lon
				g.lat = lat
				break
			g.heading = fmod(g.heading + 90 + rand.call() * 180, 360.0)  # the coast, or the edge of her waters

# From the ship at sea: galleys within sight are seen. Returns those newly in sight.
static func lookout(S: Dictionary, lon: float, lat: float) -> Array:
	var seen := []
	for g in ensure(S).galleys:
		var in_sight := Geo.dist_nm(lon, lat, g.lon, g.lat) <= GALLEYS.sightNm
		if in_sight:
			if not g.get("inSight", false):
				seen.append(g)
			g.seen = S.day
			g.seenLon = g.lon
			g.seenLat = g.lat
		g.inSight = in_sight
	return seen

# In port: word of galleys seen within a few days' sail. Returns those newly reported.
static func port_reports(S: Dictionary, port: Dictionary) -> Array:
	var out := []
	for g in ensure(S).galleys:
		if Geo.dist_nm(port.lon, port.lat, g.lon, g.lat) > GALLEYS.reportNm:
			continue
		if g.get("reported") != null and S.day - g.reported < 5:
			continue
		var fresh: bool = g.seen == null or S.day - g.seen > 1
		g.reported = S.day
		if fresh:
			g.seen = S.day - 1
			g.seenLon = g.lon
			g.seenLat = g.lat
			out.append(g)
	return out

# Close enough to engage? An encounter you have hunted down, or {}.
static func contact(S: Dictionary, lon: float, lat: float) -> Dictionary:
	var P := ensure(S)
	if P.cooldown > CALM:
		return {}
	for g in P.galleys:
		if g.get("passed") != null and S.day < g.passed:
			continue
		if Geo.dist_nm(lon, lat, g.lon, g.lat) <= GALLEYS.contactNm:
			return {"where": g.zone, "big": g.big, "strength": 1.35 if g.big else 1.0, "hunted": true, "galley": g.id}
	return {}

static func end_hunt(S: Dictionary, enc: Dictionary, how: String) -> void:
	var G: Array = ensure(S).galleys
	for i in G.size():
		if G[i].id == enc.get("galley"):
			if how == "pass":
				G[i].passed = S.day + 3
			else:
				G.remove_at(i)
			return

# The odds the captain is shown before a hunted fight.
static func odds(S: Dictionary, enc: Dictionary, knots: float) -> Dictionary:
	var P := ensure(S)
	var run := clampf(0.25 + 0.11 * knots - (0.1 if enc.big else 0.0), 0.12, 0.88)
	var guns: float = Ships.stats(S.ship).fight
	var f := clampf((0.5 + 0.03 * mini(P.won, 6)) * (S.hull / 100.0 * 0.4 + 0.6) / enc.strength + guns + (GALLEYS.surprise if enc.get("hunted", false) else 0.0), 0.15, 0.92)
	return {"run": run, "fight": f}

static func tribute(S: Dictionary, enc: Dictionary) -> int:
	return int(Market.js_round(maxf(30, minf(600, S.purse * (0.25 if enc.big else 0.15)))))

# ---- The fight ---------------------------------------------------------------------------------

static func start_fight(S: Dictionary, enc: Dictionary, rand: Callable) -> Dictionary:
	var P := ensure(S)
	var you := Fight.your_side(S.ship, S.hull, P.won)
	var foe := Fight.foe_side("biggalley" if enc.big else "galley")
	if enc.get("hunted", false):
		return Fight.start(you, "attack", foe, rand, {"range": Fight.CLOSE, "surprise": true})
	return Fight.start(you, "defend", foe, rand, {"range": Fight.FAR, "tribute": tribute(S, enc)})

# What the fight came to, applied: {kind, lines, spoils?}.
static func settle_fight(S: Dictionary, enc: Dictionary, F: Dictionary, rand: Callable) -> Dictionary:
	var P := ensure(S)
	var res: String = F.done.result if F.done != null else ""
	var dmg := Fight.damage_to(F)
	var hurt := func() -> String:
		S.hull = maxf(10.0, S.hull - dmg)
		return " Your hull is damaged (%d%%)." % roundi(S.hull) if dmg >= 3 else ""
	if res == "paid":
		S.purse -= F.tribute
		P.caution += 3
		P.paid += 1
		return {"kind": "", "lines": ["You pay the corsairs %d cz to go in peace." % F.tribute]}
	if res == "escaped":
		var t: String = hurt.call()
		P.caution += 2
		P.fled += 1
		return {"kind": "port", "lines": ["You have escaped the corsairs.%s" % t]}
	if res == "taken" or res == "beaten":
		var t: String = hurt.call()
		P.notoriety += 1
		P.won += 1
		return {"kind": "discover", "lines": ["%s is beaten, her rowers broken.%s" % ["The great galley" if enc.big else "The galley", t]], "spoils": spoils_of(enc, rand)}
	if res == "sheered":
		hurt.call()
		P.notoriety += 1
		P.won += 1
		return {"kind": "discover", "lines": ["The corsairs have had enough of you and pull away for the coast."]}
	if res == "struck" or res == "boarded":
		var r := strip(S, enc, 0.2 if res == "struck" else 0.3, dmg + (10.0 if res == "boarded" else 0.0), rand)
		P.notoriety += 0 if res == "struck" else 1
		P.lost += 1
		return r
	var t: String = hurt.call()
	return {"kind": "", "lines": ["The galley gets away.%s" % t]}

# Boarded and stripped: a share of the cargo, some coin, the hull battered. Boarding nets keep some.
static func strip(S: Dictionary, enc: Dictionary, base: float, dmg: float, rand: Callable) -> Dictionary:
	var guard: float = Ships.stats(S.ship).get("guard", 0.0)
	var share: float = (base + rand.call() * base) * (1 - guard)
	var lost := PackedStringArray()
	for g in Data.goods:
		var n: int = S.cargo[g.id]
		var take := int(Market.js_round(n * share))
		if take > 0:
			S.paid[g.id] = S.paid[g.id] * (n - take) / n if n - take > 0 else 0.0
			S.cargo[g.id] = n - take
			lost.append("%d %s of %s" % [take, g.one if take == 1 else g.unit, g.name.to_lower()])
	var cash := int(Market.js_round(minf(300, maxf(0, S.purse - LEAVE_PURSE) * 0.2) * (1 - guard)))
	S.purse -= cash
	S.hull = battered(S.hull, maxf(8, dmg))
	var what := ", ".join(lost) if not lost.is_empty() else "no cargo"
	return {"kind": "", "lines": ["The corsairs strip the ship: %s%s. The hull is damaged (%d%%)." % [what, " and %d cz" % cash if cash else "", roundi(S.hull)]]}

# What a beaten galley has aboard: coin, a good or two, and the crown's bounty for taking her.
static func spoils_of(enc: Dictionary, rand: Callable) -> Dictionary:
	var m: float = enc.strength
	var goods := []
	var pool: Array = PLUNDER_GOODS.duplicate()
	var n := 1 if rand.call() < 0.5 else 2
	for k in n:
		var g: String = pool.pop_at(int(rand.call() * pool.size()))
		goods.append({"good": g, "qty": int(Market.js_round((4 + rand.call() * 8) * m))})
	return {"cash": int(Market.js_round((60 + rand.call() * 140) * m)), "goods": goods, "bounty": BOUNTY.big if enc.big else BOUNTY.galley}

# After a win: plunder the galley (coin, goods, the crown's bounty, a fearsome name) or let her go.
static func plunder(S: Dictionary, enc: Dictionary, spoils: Dictionary, take: bool, free: int) -> Dictionary:
	var P := ensure(S)
	if not take:
		P.caution += 1
		return {"kind": "port", "lines": ["You let the galley limp home. Word gets round that you are not one to hunt corsairs."]}
	P.notoriety += 3
	P.plundered += 1
	S.purse += spoils.cash
	var took := PackedStringArray()
	var room := maxi(0, free)
	for item in spoils.goods:
		var n := mini(int(item.qty), room)
		if n <= 0:
			continue
		room -= n
		S.cargo[item.good] += n  # taken, not bought: nothing added to what was paid
		var gd: Dictionary = Data.good(item.good)
		took.append("%d %s of %s" % [n, gd.one if n == 1 else gd.unit, gd.name.to_lower()])
	P.bounty += spoils.bounty
	var full := " (your hold could take no more)" if took.size() < spoils.goods.size() else ""
	return {"kind": "discover", "lines": ["You strip the galley: %d cz%s%s. The crown will pay %d cz for her at any Portuguese port." % [spoils.cash, " and " + ", ".join(took) if not took.is_empty() else "", full, spoils.bounty]]}

# The crown's bounty for corsairs taken, paid in a Portuguese port. Returns the message or "".
static func collect_bounty(S: Dictionary, port_id: String) -> String:
	var P := ensure(S)
	if not P.bounty or not PORTUGUESE_PORTS.has(port_id):
		return ""
	var amount: int = P.bounty
	P.bounty = 0
	P.bountyPaid += amount
	S.purse += amount
	return "The crown pays you %d cz in bounty for the corsair galleys you have taken." % amount
