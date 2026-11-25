# Distances and bearings on the chart, as world.js: nautical miles on a flat chart scaled by the
# cosine of the middle latitude.
class_name Geo
extends RefCounted

static func dist_nm(a_lon: float, a_lat: float, b_lon: float, b_lat: float) -> float:
	var mid_lat := deg_to_rad((a_lat + b_lat) / 2.0)
	var dx := (b_lon - a_lon) * cos(mid_lat)
	var dy := b_lat - a_lat
	return 60.0 * sqrt(dx * dx + dy * dy)

# Compass bearing in degrees, 0 = north, 90 = east.
static func bearing(a_lon: float, a_lat: float, b_lon: float, b_lat: float) -> float:
	var mid_lat := deg_to_rad((a_lat + b_lat) / 2.0)
	var dx := (b_lon - a_lon) * cos(mid_lat)
	var dy := b_lat - a_lat
	return fposmod(rad_to_deg(atan2(dx, dy)), 360.0)

static func port_dist(a: String, b: String) -> float:
	var A := Data.port(a)
	var B := Data.port(b)
	return dist_nm(A.lon, A.lat, B.lon, B.lat)

# Land, or off the chart (world.js isLand): the coastline polygons, each with its bounding box.
static func is_land(lon: float, lat: float) -> bool:
	for r in Data.world.offChart:
		if lon >= r.w and lon <= r.e and lat >= r.s and lat <= r.n:
			return true
	for l in Data.world.lands:
		var b: Dictionary = l.bbox
		if lon < b.w or lon > b.e or lat < b.s or lat > b.n:
			continue
		if _in_poly(lon, lat, l.pts):
			return true
	return false

static func _in_poly(x: float, y: float, pts: Array) -> bool:
	var inside := false
	var j := pts.size() - 1
	for i in pts.size():
		var xi: float = pts[i][0]
		var yi: float = pts[i][1]
		var xj: float = pts[j][0]
		var yj: float = pts[j][1]
		if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
			inside = not inside
		j = i
	return inside
