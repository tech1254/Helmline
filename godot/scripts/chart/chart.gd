# The chart: the coasts as the captains knew them, the ports, and the course to a port.
# Land you have not sighted stays blank. Drag to pan, wheel or pinch to zoom, click a port.
extends Node2D

signal port_clicked(id: String)

const SCALE := 40.0            # pixels per degree of latitude
const COS0 := 0.8829475929     # cos(28°): the chart's east-west stretch, as world.js
const SEA := Color(0.72, 0.78, 0.76)
const LAND := Color(0.93, 0.88, 0.76)
const INK := Color(0.30, 0.22, 0.14)
const RED := Color(0.62, 0.16, 0.12)

var known_groups: Dictionary = {}
var known_ports: Dictionary = {}
var route: Array = []
var route_from := ""
var font: Font

static func to_px(lon: float, lat: float) -> Vector2:
	return Vector2(lon * COS0 * SCALE, -lat * SCALE)

static func to_geo(p: Vector2) -> Vector2:
	return Vector2(p.x / (COS0 * SCALE), -p.y / SCALE)

func _ready() -> void:
	font = ThemeDB.fallback_font
	for g in Data.world.knownLands:
		known_groups[g] = true
	for p in Data.ports:
		if p.get("known", false):
			known_ports[p.id] = true
	queue_redraw()

func set_route(from_id: String, pts: Array) -> void:
	route_from = from_id
	route = pts
	queue_redraw()

func _draw() -> void:
	var b: Dictionary = Data.world.bounds
	var tl := to_px(b.west, b.north)
	var br := to_px(b.east, b.south)
	draw_rect(Rect2(tl, br - tl), SEA)
	# rhumb lines from a compass rose off the Canaries, as on a portolan chart
	var rose := to_px(-20, 30)
	for i in 16:
		var a := TAU * i / 16.0
		draw_line(rose, rose + Vector2(cos(a), sin(a)) * 4000.0, Color(INK, 0.10 if i % 2 else 0.18), 1.0)
	for land in Data.world.lands:
		if not known_groups.has(land.group):
			continue
		var poly := PackedVector2Array()
		for p in land.pts:
			poly.append(to_px(p[0], p[1]))
		if poly.size() >= 3:
			draw_colored_polygon(poly, LAND)
			poly.append(poly[0])
			draw_polyline(poly, INK, 1.2, true)
	if route.size() > 0 and route_from != "":
		var s := Data.port(route_from)
		var line := PackedVector2Array([to_px(s.lon, s.lat)])
		for p in route:
			line.append(to_px(p[0], p[1]))
		draw_polyline(line, RED, 2.0, true)
	for p in Data.ports:
		if not known_ports.has(p.id):
			continue
		var at := to_px(p.lon, p.lat)
		var is_here: bool = p.id == Game.S.ship.docked
		var r := 5.0 if is_here else 3.5
		draw_circle(at, r + 1.5, INK)
		draw_circle(at, r, RED if is_here else LAND)
		draw_string(font, at + Vector2(7, 4), p.name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, INK)
	# her wake, and the ship herself
	var trail := PackedVector2Array()
	for t in Game.S.trail:
		trail.append(to_px(t[0], t[1]))
	trail.append(to_px(Game.S.ship.lon, Game.S.ship.lat))
	if trail.size() > 1:
		draw_polyline(trail, Color(INK, 0.35), 1.5, true)
	if Game.at_sea():
		var at := to_px(Game.S.ship.lon, Game.S.ship.lat)
		var h := deg_to_rad(float(Game.S.ship.heading))
		var fwd := Vector2(sin(h), -cos(h))
		var side := Vector2(-fwd.y, fwd.x)
		var hull := PackedVector2Array([at + fwd * 9, at + side * 4 - fwd * 6, at - side * 4 - fwd * 6])
		draw_colored_polygon(hull, RED)
		draw_polyline(PackedVector2Array([hull[0], hull[1], hull[2], hull[0]]), INK, 1.2, true)

# The known port nearest a point on the chart, within `px` pixels.
func port_at(pos: Vector2, px := 14.0) -> String:
	var best := ""
	var bd := px
	for p in Data.ports:
		if not known_ports.has(p.id):
			continue
		var d := pos.distance_to(to_px(p.lon, p.lat))
		if d < bd:
			bd = d
			best = p.id
	return best
