# The game's look, in one place: every colour, texture and font the screens use comes from
# here, so a new vellum, a new palette or a new typeface is a change to this file (or to the
# files it names in art/ui), never to the screens. Autoloaded as `Look`.
#   art/ui/vellum.png  the chart's parchment, tiled under the sea and land (optional)
#   art/ui/panel.png   the panels' background, a 9-slice (optional)
#   art/ui/font.ttf    the text face (optional; falls back to Godot's own)
extends Node

# The chart
var sea := Color(0.72, 0.78, 0.76)
var land := Color(0.93, 0.88, 0.76)
var ink := Color(0.30, 0.22, 0.14)
var accent := Color(0.62, 0.16, 0.12)   # your ship, your port, your course
var rhumb := Color(0.30, 0.22, 0.14, 0.15)
# Panels and text
var panel_bg := Color(0.20, 0.16, 0.12, 0.92)
var text := Color(0.96, 0.92, 0.84)
var text_quiet := Color(0.96, 0.92, 0.84, 0.65)
var font_size := 16

const VELLUM := "res://art/ui/vellum.png"
const PANEL := "res://art/ui/panel.png"
const FONT := "res://art/ui/font.ttf"

var vellum: Texture2D
var theme: Theme

func _ready() -> void:
	vellum = load(VELLUM) if ResourceLoader.exists(VELLUM) else null
	theme = make_theme()

# One Theme for every screen's UI: panels, buttons and labels take their look from it.
func make_theme() -> Theme:
	var t := Theme.new()
	if ResourceLoader.exists(FONT):
		t.default_font = load(FONT)
	t.default_font_size = font_size
	var bg: StyleBox
	if ResourceLoader.exists(PANEL):
		var sb := StyleBoxTexture.new()
		sb.texture = load(PANEL)
		sb.texture_margin_left = 24; sb.texture_margin_right = 24; sb.texture_margin_top = 24; sb.texture_margin_bottom = 24
		bg = sb
	else:
		var sf := StyleBoxFlat.new()
		sf.bg_color = panel_bg
		sf.set_corner_radius_all(8)
		sf.set_content_margin_all(12)
		bg = sf
	t.set_stylebox("panel", "PanelContainer", bg)
	t.set_color("font_color", "Label", text)
	t.set_color("font_color", "Button", text)
	return t
