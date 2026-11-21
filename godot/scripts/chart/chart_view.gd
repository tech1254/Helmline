# The chart screen: pan and zoom, click a port to plan a course, set sail and watch her go.
extends Node2D

signal sea_view

@onready var chart: Node2D = $Chart
@onready var cam: Camera2D = $Camera
@onready var info: Label = $UI/Info
@onready var status: Label = $UI/Bar/Status
@onready var sail_btn: Button = $UI/Bar/Sail

var dragging := false
var drag_from := Vector2.ZERO
var plan: Dictionary = {}
var follow := true

func _ready() -> void:
	var p := Data.port(Game.here())
	cam.position = chart.to_px(p.lon, p.lat) + Vector2(140, 160)  # the port panel takes the right side
	cam.zoom = Vector2(1.6, 1.6)
	info.text = "You are in %s. Click a port to plan a course." % p.name
	Game.changed.connect(_on_changed, CONNECT_DEFERRED)
	Game.docked.connect(_on_docked)
	for b in $UI/Bar/Speeds.get_children():
		b.pressed.connect(func(): Game.speed = int(b.name.trim_prefix("x")); _on_changed())
	sail_btn.pressed.connect(func(): Game.set_sail(plan); plan = {}; follow = true)
	$UI/Bar/SeaView.pressed.connect(func(): sea_view.emit())
	_on_changed()

func _process(_d: float) -> void:
	if Game.at_sea() and follow:
		cam.position = cam.position.lerp(chart.to_px(Game.S.ship.lon, Game.S.ship.lat), 0.05)

func _on_changed() -> void:
	chart.queue_redraw()
	var S := Game.S
	var where: String = ("at %s" % Data.port(S.ship.docked).name) if S.ship.docked != "" else "at sea"
	var w := Game.wind_now()
	var wind := "wind %s, %s" % [Wind.compass_point(w.w.from), "fresh" if w.w.strength > 0.7 else "moderate" if w.w.strength > 0.4 else "light"]
	var sailing := ""
	if Game.at_sea():
		sailing = " · %s, %.1f knots" % [Wind.point_of_sail(w.off).to_lower(), w.knots]
	status.text = "%s · %s · %d cz · %s%s" % [Calendar.fmt_date(S.day), where, int(S.purse), wind, sailing]
	sail_btn.visible = not plan.is_empty() and not Game.at_sea()
	for b in $UI/Bar/Speeds.get_children():
		b.button_pressed = int(b.name.trim_prefix("x")) == Game.speed

func _on_docked(id: String) -> void:
	info.text = "Dropped anchor at %s." % Data.port(id).name
	chart.set_route("", [])

func _unhandled_input(e: InputEvent) -> void:
	if not visible:
		return
	if e is InputEventMouseButton:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP and e.pressed:
			zoom_by(1.15)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN and e.pressed:
			zoom_by(1 / 1.15)
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
		follow = false
	elif e is InputEventMagnifyGesture:
		zoom_by(e.factor)
	elif e is InputEventPanGesture:
		cam.position += e.delta * 8 / cam.zoom
		follow = false
	elif e is InputEventKey and e.pressed and e.keycode == KEY_SPACE:
		Game.speed = 0 if Game.speed else 1
		_on_changed()

func zoom_by(f: float) -> void:
	cam.zoom = (cam.zoom * f).clamp(Vector2(0.3, 0.3), Vector2(6, 6))

func click(world_pos: Vector2) -> void:
	if Game.at_sea():
		return
	var id: String = chart.port_at(world_pos, 14.0 / cam.zoom.x)
	if id == "" or id == Game.here():
		return
	show_plan(id)

func show_plan(id: String) -> Dictionary:
	plan = Game.plan_to(id)
	var to := Data.port(id)
	if plan.is_empty():
		chart.set_route("", [])
		info.text = "No passage to %s for your %s." % [to.name, Game.stats().name.to_lower()]
	else:
		chart.set_route(Game.here(), plan.route)
		info.text = "%s: %d nautical miles, about %d days in today's winds, %d cz in wages." % [to.name, roundi(plan.nm), maxi(1, roundi(plan.days)), plan.cost]
		sail_btn.text = "Set sail for %s" % to.name
	_on_changed()
	return plan
