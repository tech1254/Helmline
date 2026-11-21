# Wear and repairs (port of public/js/wear.js): a hull runs 100 (sound) to 0, wears a little each
# day at sea (faster in the tropics and as she ages), storms knock off a chunk now and then, and
# a yard (or her crew on a beach) puts her right for money and days.
class_name Wear
extends RefCounted

const YARDS := ["lisbon", "lagos", "funchal", "seville", "palos", "bruges", "antwerp", "bristol"]
const WEAR_TEMPERATE := 0.08
const WEAR_TROPIC := 0.2
const TROPIC_LAT := 26.0
const STORM_PER_DAY := 0.004
const STORM_MIN := 5.0
const STORM_MAX := 15.0
const YARD_COST_PT := 6.0
const YARD_PTS_PER_DAY := 5.0
const BEACH_COST := 0.4
const BEACH_PTS_PER_DAY := 3.0
const BEACH_TO := 80
const LEAKS_BELOW := 60.0
const DANGER_BELOW := 25.0
const SOUND_UNTIL := 0.7
const TROPIC_AGE := 2.0
const STRAIN_AGE := 1.5

static func hull_def(hull_id: String) -> Dictionary:
	var h: Dictionary = Data.hulls.get(hull_id, {})
	return h if not h.is_empty() else Data.hulls.caravel

static func service_years(ship: Dictionary, day: float) -> float:
	if not ship.has("built"):
		return 0.0
	var tropic: float = ship.get("tropic", 0.0)
	var strain: float = ship.get("strain", 0.0)
	return maxf(0.0, (day - float(ship.built) + (TROPIC_AGE - 1) * tropic + (STRAIN_AGE - 1) * strain) / 365.0)

static func life_share(hull_id: String, years: float) -> float:
	return years / float(hull_def(hull_id).get("life", 15))

static func sound_cap(hull_id: String, years: float) -> int:
	var f := life_share(hull_id, years)
	if f <= SOUND_UNTIL:
		return 100
	if f <= 1.0:
		return int(js_round(100 - 50 * (f - SOUND_UNTIL) / (1 - SOUND_UNTIL)))
	return maxi(20, int(js_round(50 - 60 * (f - 1))))

static func age_wear(hull_id: String, years: float) -> float:
	return 1 + 2 * maxf(0.0, life_share(hull_id, years) - SOUND_UNTIL)

static func wear_per_day(lat: float, hull_id: String, years: float, tropic_wear := 1.0) -> float:
	var base := WEAR_TEMPERATE + (WEAR_TROPIC - WEAR_TEMPERATE) * tropic_wear if lat < TROPIC_LAT else WEAR_TEMPERATE
	return base * age_wear(hull_id, years)

# How much likelier a storm is here and now: northern waters in winter, Caribbean hurricanes.
static func gale_factor(lon: float, lat: float, day: float) -> float:
	var m: int = Calendar.date_of(day).month - 1
	var winter := m >= 8 or m <= 1
	var northern := clampf((lat - 42.5) / 3.0, 0.0, 1.0) * (1.0 if lon > -20 else 0.6)
	var f := 1 + northern * (6.0 if winter else 2.0)
	if lon < -55 and lat > 10 and lat < 32 and m >= 7 and m <= 9:
		f += 4
	return f

static func storms(days: float, rng: RandomNumberGenerator, factor := 1.0) -> float:
	if rng.randf() < STORM_PER_DAY * days * factor:
		return STORM_MIN + rng.randf() * (STORM_MAX - STORM_MIN)
	return 0.0

static func leak_share(pct: float, leak := 1.0) -> float:
	return leak * (LEAKS_BELOW - pct) / 200.0 if pct < LEAKS_BELOW else 0.0

static func per_point(hull_id: String) -> float:
	var h := hull_def(hull_id)
	return minf(0.003 * float(h.price), YARD_COST_PT * pow(float(h.get("size", 1)), 1.5))

static func yard_quote(hull_id: String, pct: float, years := 0.0) -> Dictionary:
	var to := sound_cap(hull_id, years)
	var pts := maxf(0.0, to - pct)
	return {"pts": pts, "cost": int(ceil(pts * per_point(hull_id))), "days": int(ceil(pts / YARD_PTS_PER_DAY)), "to": to}

static func beach_quote(hull_id: String, pct: float, years := 0.0) -> Dictionary:
	var to := mini(BEACH_TO, sound_cap(hull_id, years))
	var pts := maxf(0.0, to - pct)
	return {"pts": pts, "cost": int(ceil(pts * BEACH_COST * per_point(hull_id))), "days": int(ceil(pts / BEACH_PTS_PER_DAY)), "to": to}

static func js_round(x: float) -> float:
	return floor(x + 0.5)
