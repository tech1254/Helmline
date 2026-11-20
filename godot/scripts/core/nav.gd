# Routes between ports, as world.js findPath, from the ready-made table in data/routes.json.
# `skill` is the navigator's grasp of the winds (0 to 1, in quarters); `coastal` is a ship that
# must keep near the shore (a barca). A river port is reached through its river's mouth; river
# legs carry a third element, 1. Routes between arbitrary points at sea come in stage 3.
class_name Nav
extends RefCounted

static func _fx(v: float) -> String:
	return "%.3f" % v

static func key(a_lon: float, a_lat: float, b_lon: float, b_lat: float, skill: float) -> String:
	var s := str(skill) if skill != int(skill) else str(int(skill))
	return "%s,%s>%s,%s@%s" % [_fx(a_lon), _fx(a_lat), _fx(b_lon), _fx(b_lat), s]

static func river_of(port_id: String) -> Dictionary:
	for r in Data.world.rivers.values():
		if r.port == port_id:
			return r
	return {}

static func _legs(r: Dictionary, upstream: bool) -> Array:
	var pts: Array = r.pts.slice(1) if upstream else r.pts.slice(0, r.pts.size() - 1)
	if not upstream:
		pts.reverse()
	return pts.map(func(p): return [p[0], p[1], 1])

# A list of [lon, lat] waypoints from port a to port b (excluding a), or null if no route.
static func port_route(a: String, b: String, skill := 1.0, coastal := false) -> Variant:
	if a == b:
		return []
	var ra := river_of(a)
	var rb := river_of(b)
	if not ra.is_empty() and not rb.is_empty():
		return null  # no river joins another
	if not rb.is_empty():
		var sea = [] if a == rb.mouth else port_route(a, rb.mouth, skill, coastal)
		return null if sea == null else sea + _legs(rb, true)
	if not ra.is_empty():
		var sea = [] if b == ra.mouth else port_route(ra.mouth, b, skill, coastal)
		return null if sea == null else _legs(ra, false) + sea
	var A := Data.port(a)
	var B := Data.port(b)
	skill = round(clampf(skill, 0.0, 1.0) * 4.0) / 4.0
	var k := key(A.lon, A.lat, B.lon, B.lat, skill) + ("c" if coastal else "")
	var table: Dictionary = Data.load_routes().routes
	if not table.has(k):
		return null
	var r = table[k]
	return null if r == null else r.map(func(p): return [p[0], p[1]])

# The length of a route in nautical miles, from its start.
static func route_nm(start_lon: float, start_lat: float, route: Array) -> float:
	var nm := 0.0
	var x := start_lon
	var y := start_lat
	for p in route:
		nm += Geo.dist_nm(x, y, p[0], p[1])
		x = p[0]
		y = p[1]
	return nm
