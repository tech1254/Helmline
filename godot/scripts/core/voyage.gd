# Sailing a route, as the browser game's sim.js update and voyage.js estimateVoyage: the ship
# steers for each waypoint in turn at the speed the wind gives her on that heading.
class_name Voyage
extends RefCounted

static func hull_factor(hull_pct: float) -> float:
	return 0.6 + 0.4 * hull_pct / 100.0  # a battered hull sails slower

# Sail the route on paper, with the winds as they stand, to estimate the passage.
static func estimate(st: Dictionary, route: Array, lon: float, lat: float, start_day: float, hull_pct := 100.0) -> Dictionary:
	var day := start_day
	var nm := 0.0
	var hot := 0.0
	var hf := hull_factor(hull_pct)
	for pt in route:
		var tl: float = pt[0]
		var ta: float = pt[1]
		var river: bool = pt.size() > 2 and pt[2] == 1
		for guard in 20000:
			var rem := Geo.dist_nm(lon, lat, tl, ta)
			if rem < 0.5:
				break
			var b := Geo.bearing(lon, lat, tl, ta)
			var w := Wind.at(lon, lat, day)
			var off: float = Wind.angle_diff(b, w.from)
			var f: float = Wind.sail_factor(off) * (0.45 + 0.55 * w.strength)
			var per_day: float = (Wind.RIVER_KNOTS * hf if river else Wind.knots_at(st, off, f, hf)) * 24.0
			var step := minf(per_day * 0.1, rem)
			lat += (step * cos(deg_to_rad(b))) / 60.0
			lon += (step * sin(deg_to_rad(b))) / (60.0 * cos(deg_to_rad(lat)))
			day += step / per_day
			if lat < 26:
				hot += step / per_day
			nm += step
		lon = tl
		lat = ta
	var days := day - start_day
	return {"days": days, "nm": nm, "hot": hot, "cost": ceili(days * st.upkeep)}

# Move a ship {lon, lat, heading, route} along her route for `days`. Returns the days used
# (less than asked if she arrives).
static func step(ship: Dictionary, st: Dictionary, day: float, days: float, hull_pct := 100.0) -> float:
	var used := 0.0
	var hf := hull_factor(hull_pct)
	while days - used > 1e-9 and not ship.route.is_empty():
		var dd := minf(0.05, days - used)
		var pt: Array = ship.route[0]
		var river: bool = pt.size() > 2 and pt[2] == 1
		ship.heading = Geo.bearing(ship.lon, ship.lat, pt[0], pt[1])
		var knots: float = Wind.RIVER_KNOTS * hf if river else Wind.ship_wind(st, ship.lon, ship.lat, ship.heading, day + used, hf).knots
		var nm := knots * 24.0 * dd
		var rem: float = Geo.dist_nm(ship.lon, ship.lat, pt[0], pt[1])
		used += dd
		if nm >= rem:
			ship.lon = pt[0]
			ship.lat = pt[1]
			ship.route.pop_front()
		else:
			var h := deg_to_rad(float(ship.heading))
			ship.lat += (nm * cos(h)) / 60.0
			ship.lon += (nm * sin(h)) / (60.0 * cos(deg_to_rad(ship.lat - (nm * cos(h)) / 60.0)))
	return used
