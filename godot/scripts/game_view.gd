# The game screen: the chart, or the sea around your ship, one at a time.
extends Node

@onready var sea: Node3D = $Sea
@onready var chart: Node2D = $ChartView
@onready var sea_ui: CanvasLayer = $SeaUI
@onready var sea_status: Label = $SeaUI/Status

func _ready() -> void:
	chart.sea_view.connect(func(): show_sea(true))
	$SeaUI/Chart.pressed.connect(func(): show_sea(false))
	Game.changed.connect(_refresh)
	show_sea(false)

func show_sea(on: bool) -> void:
	sea.visible = on
	sea_ui.visible = on
	chart.visible = not on
	chart.get_node("UI").visible = not on
	sea.get_node("Camera").current = on
	_refresh()

func _refresh() -> void:
	if not sea_ui.visible:
		return
	var S := Game.S
	if Game.at_sea():
		var w := Game.wind_now()
		sea_status.text = "%s · bound for %s · %s, wind %s · %.1f knots" % [Calendar.fmt_date(S.day), Data.port(S.ship.dest).name, Wind.point_of_sail(w.off), Wind.compass_point(w.w.from), w.knots]
	else:
		sea_status.text = "%s · at anchor in %s" % [Calendar.fmt_date(S.day), Data.port(S.ship.docked).name]
