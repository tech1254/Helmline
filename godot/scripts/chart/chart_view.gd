# The chart screen: pan and zoom the chart, click a port to see the course and the distance,
# and set sail (stage 3 sails it).
extends Node2D

@onready var chart: Node2D = $Chart
@onready var cam: Camera2D = $Camera
@onready var info: Label = $UI/Info

var dragging := false
var drag_from := Vector2.ZERO
var ship := {"hull": "barca", "fit": {}}

func _ready() -> void:
	var p := Data.port(chart.here)
	cam.position = chart.to_px(p.lon, p.lat) + Vector2(0, 200)
	cam.zoom = Vector2(1.6, 1.6)
	info.text = "You are in %s, %s. Click a port to plan a course." % [p.name, Calendar.fmt_date(0)]

func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventMouseButton:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP and e.pressed:
			zoom_at(1.15, e.position)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN and e.pressed:
			zoom_at(1 / 1.15, e.position)
		elif e.button_index == MOUSE_BUTTON_LEFT:
			if e.pressed:
				dragging = true
				drag_from = e.position
			else:
				dragging = false
				if e.position.distance_to(drag_from) < 6:
					click(get_global_mouse_position())
	elif e is InputEventMouseMotion and dragging:
		cam.position -= e.relative / cam.zoom
	elif e is InputEventMagnifyGesture:
		zoom_at(e.factor, e.position)
	elif e is InputEventPanGesture:
		cam.position += e.delta * 8 / cam.zoom

func zoom_at(f: float, _at: Vector2) -> void:
	cam.zoom = (cam.zoom * f).clamp(Vector2(0.3, 0.3), Vector2(6, 6))

func click(world_pos: Vector2) -> void:
	var id: String = chart.port_at(world_pos, 14.0 / cam.zoom.x)
	if id == "" or id == chart.here:
		return
	plan(id)

func plan(id: String) -> Dictionary:
	var st := Ships.stats(ship)
	var coastal: bool = Ships.hull_of(ship).get("coastal", false)
	var r = Nav.port_route(chart.here, id, 0.5, coastal)
	var to := Data.port(id)
	if r == null:
		chart.set_route("", [])
		info.text = "No passage to %s for a %s." % [to.name, st.name.to_lower()]
		return {}
	var a := Data.port(chart.here)
	var nm := Nav.route_nm(a.lon, a.lat, r)
	var days: float = nm / (float(st.knots) * 24.0 * 0.8)
	chart.set_route(chart.here, r)
	info.text = "%s: %d nautical miles, about %d days in your %s." % [to.name, roundi(nm), maxi(1, roundi(days)), st.name.to_lower()]
	return {"nm": nm, "days": days, "route": r}
