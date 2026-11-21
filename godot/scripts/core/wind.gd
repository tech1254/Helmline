# The prevailing winds of the Atlantic and how a ship sails in them, as world.js windAt and
# ships.js knotsAt. Wind directions are where it blows FROM, in degrees.
class_name Wind
extends RefCounted

const RIVER_KNOTS := 2.4
const POLAR := [[0.0, 0.24], [40.0, 0.27], [50.0, 0.5], [65.0, 0.78], [90.0, 0.95], [115.0, 1.0], [140.0, 0.95], [165.0, 0.85], [180.0, 0.8]]
const POINTS := ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

static func angle_diff(a: float, b: float) -> float:
	return absf(fposmod(fposmod(a - b, 360.0) + 540.0, 360.0) - 180.0)

static func smooth(e0: float, e1: float, x: float) -> float:
	var t := clampf((x - e0) / (e1 - e0), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

static func at(lon: float, lat: float, day: float) -> Dictionary:
	var north := 1.0 - smooth(33, 28, lat)
	var guinea := smooth(9.5, 5, lat) * smooth(-50, -42, lon)
	var south := smooth(1, -4, lat)
	var trade := (1.0 - north) * (1.0 - guinea)
	var med := smooth(-6, -4.5, lon) * smooth(30, 33, lat) * (1.0 - smooth(44.5, 46.5, lat))
	var coastal := smooth(-16, -11, lon) * (1.0 - smooth(43.5, 45.5, lat)) * (1.0 - med)
	var trade_from := 50.0 - 32.0 * smooth(-24, -15, lon) + 28.0 * smooth(-45, -62, lon)
	var roaring := smooth(-29, -34, lat)
	var horse := smooth(-22, -27, lat) * (1.0 - roaring)
	var se_trade := south * (1.0 - smooth(-22, -27, lat))
	var benguela := smooth(6, 11, lon)
	var se_from := 125.0 - 30.0 * smooth(-30, -36, lon)
	var sw := smooth(45, 50, lat)
	var open_north := north * (1.0 - coastal) * (1.0 - med)
	var zones := [
		[trade_from, trade, 1.0],
		[352.0, north * coastal, 0.85],
		[278.0 - 30.0 * sw, open_north * smooth(33, 38, lat), 1.0 + 0.1 * sw],
		[15.0, open_north * (1.0 - smooth(33, 38, lat)), 0.55],
		[300.0, north * med, 0.6],
		[220.0, guinea * (1.0 - south), 0.5],
		[se_from, se_trade * (1.0 - benguela), 1.0],
		[165.0, se_trade * benguela, 0.9],
		[160.0, horse * benguela, 0.8],
		[200.0, horse * (1.0 - benguela), 0.35],
		[285.0, roaring * south, 1.0],
	]
	var vx := 0.0
	var vy := 0.0
	var wob := 10.0 * sin(day * 0.23 + lon * 0.31) + 7.0 * sin(day * 0.57 + lat * 0.41)
	for z in zones:
		var a: float = deg_to_rad(z[0] + wob)
		vx += sin(a) * z[1] * z[2]
		vy += cos(a) * z[1] * z[2]
	var strength := minf(1.0, sqrt(vx * vx + vy * vy)) * (0.9 + 0.1 * sin(day * 0.4 + lon))
	var from := fposmod(rad_to_deg(atan2(vx, vy)) + 360.0, 360.0)
	return {"from": from, "strength": strength}

static func sail_factor(off: float) -> float:
	for i in range(1, POLAR.size()):
		var a1: float = POLAR[i][0]
		var f1: float = POLAR[i][1]
		var a0: float = POLAR[i - 1][0]
		var f0: float = POLAR[i - 1][1]
		if off <= a1:
			return f0 + ((off - a0) / (a1 - a0)) * (f1 - f0)
	return POLAR[-1][1]

static func point_of_sail(off: float) -> String:
	if off < 45: return "Beating to windward"
	if off < 75: return "Close-hauled"
	if off < 110: return "Beam reach"
	if off < 150: return "Broad reach"
	return "Running before the wind"

static func compass_point(deg: float) -> String:
	return POINTS[int(round(fposmod(deg, 360.0) / 22.5)) % 16]

static func point_mult(st: Dictionary, off: float) -> float:
	var m: float
	if off <= 60: m = st.up
	elif off < 90: m = st.up + (1.0 - st.up) * (off - 60.0) / 30.0
	elif off <= 110: m = 1.0
	elif off < 140: m = 1.0 + (st.down - 1.0) * (off - 110.0) / 30.0
	else: m = st.down
	if off > 75: m *= st.offWind
	return m

# Speed in knots. f = the caravel's sail factor in this wind (sail_factor × wind strength).
static func knots_at(st: Dictionary, off: float, f: float, hull_factor := 1.0) -> float:
	var k: float = st.knots * hull_factor * f * point_mult(st, off)
	return maxf(k, st.oars * hull_factor) if st.oars else k

# The wind's effect on a ship on a heading here today: {w, off, f, knots}.
static func ship_wind(st: Dictionary, lon: float, lat: float, heading: float, day: float, hull_factor := 1.0) -> Dictionary:
	var w := at(lon, lat, day)
	var off: float = angle_diff(heading, w.from)
	var f: float = sail_factor(off) * (0.45 + 0.55 * w.strength)
	return {"w": w, "off": off, "f": f, "knots": knots_at(st, off, f, hull_factor)}
