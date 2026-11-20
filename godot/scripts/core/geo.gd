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
