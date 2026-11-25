# The game screen: the chart, or the sea around your ship, one at a time.
extends Node

@onready var sea: Node3D = $Sea
@onready var chart: Node2D = $ChartView
@onready var sea_ui: CanvasLayer = $SeaUI
@onready var sea_status: Label = $SeaUI/Status

var fight_scene := Node3D.new()
var fight_panel := CanvasLayer.new()

func _ready() -> void:
	chart.sea_view.connect(func(): show_sea(true))
	$SeaUI/Chart.pressed.connect(func(): show_sea(false))
	Game.changed.connect(_refresh)
	# a fight is seen at sea: the galley on your beam, the guns, and the panel of choices over it
	fight_scene.set_script(load("res://scripts/fight_scene.gd"))
	sea.add_child(fight_scene)
	fight_panel.set_script(load("res://scripts/ui/fight_panel.gd"))
	add_child(fight_panel)
	Game.encounter.connect(_on_encounter)
	fight_panel.acted.connect(func(_l): fight_scene.volley(Game.fight.get("shots", [])))
	Game.changed.connect(func():
		if Game.pending.is_empty() and fight_scene.foe and not fight_scene.leaving:
			fight_scene.finish()
			sea.get_node("Camera").foe = null)
	show_sea(false)
	_dev_start.call_deferred()

# Dev links for trying a scene straight away in the web build: ?dev=corsairs (a galley comes at
# you off Barbary), ?dev=hunt (you have run one down), ?dev=greatgalley.
func _dev_start() -> void:
	if not OS.has_feature("web"):
		return
	var q := str(JavaScriptBridge.eval("location.search"))
	if not q.contains("dev="):
		return
	Game.S.ship.docked = ""
	Game.S.ship.lon = -9.0
	Game.S.ship.lat = 33.2
	Game.S.ship.heading = 200.0
	Game.S.ship.hull = "caravel"
	Game.S.purse = 800.0
	Game.S.cargo.wine = 12
	Game.S.paid.wine = 110.0
	Game.speed = 1
	if q.contains("dev=hunt"):
		Game.S.pirates.galleys = [{"id": 99, "lon": -9.0, "lat": 33.2, "heading": 0.0, "big": false, "zone": "the Barbary coast", "until": 30.0, "seen": null}]
		Game.corsairs(0.01)
	else:
		Game.meet({"where": "the Barbary coast", "big": q.contains("greatgalley"), "strength": 1.35 if q.contains("greatgalley") else 1.0})

func _on_encounter(enc: Dictionary) -> void:
	show_sea(true)
	if fight_scene.foe == null or fight_scene.leaving:
		fight_scene.begin(enc)
	sea.get_node("Camera").foe = fight_scene.foe

func show_sea(on: bool) -> void:
	sea.visible = on
	sea_ui.visible = on
	$SeaUI/Chart.disabled = not Game.pending.is_empty()
	chart.visible = not on
	chart.get_node("UI").visible = not on
	sea.get_node("Camera").current = on
	_refresh()

func _refresh() -> void:
	if not sea_ui.visible:
		return
	$SeaUI/Chart.disabled = not Game.pending.is_empty()
	var S := Game.S
	if Game.at_sea():
		var w := Game.wind_now()
		var bound: String = ("bound for %s" % Data.port(S.ship.dest).name) if S.ship.dest != "" else "at sea"
		sea_status.text = "%s · %s · %s, wind %s · %.1f knots" % [Calendar.fmt_date(S.day), bound, Wind.point_of_sail(w.off), Wind.compass_point(w.w.from), w.knots]
	else:
		sea_status.text = "%s · at anchor in %s" % [Calendar.fmt_date(S.day), Data.port(S.ship.docked).name]
