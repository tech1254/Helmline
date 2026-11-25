# The start screen: carry on the saved game, or begin a new one for Portugal or Castile. A new game
# over a saved one asks first, since it replaces it.
extends CanvasLayer

var box := VBoxContainer.new()
var confirm := ""  # the nation a new game is waiting to be confirmed for

func _ready() -> void:
	layer = 20
	var dim := ColorRect.new()
	dim.color = Color(0.05, 0.07, 0.09, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var panel := PanelContainer.new()
	panel.theme = Look.theme
	panel.custom_minimum_size.x = 420
	var m := MarginContainer.new()
	for k in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + k, 22)
	box.add_theme_constant_override("separation", 10)
	m.add_child(box)
	panel.add_child(m)
	center.add_child(panel)
	Game.speed = 0
	_build()

func _label(t: String, size: int, quiet := false) -> Label:
	var l := Label.new()
	l.text = t
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	if quiet:
		l.add_theme_color_override("font_color", Look.text_quiet)
	return l

func _button(t: String, primary := false) -> Button:
	var b := Button.new()
	b.text = t
	b.custom_minimum_size.y = 46
	if primary:
		b.add_theme_color_override("font_color", Color(1, 0.85, 0.55))
	return b

func _build() -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.queue_free()
	box.add_child(_label("Helmline", 34))
	box.add_child(_label("Trade, sail and fight along the coasts of the known world, 1451 to 1551.", 14, true))
	var sum := Game.save_summary()
	if not sum.is_empty():
		var go := _button("Continue", true)
		go.pressed.connect(_play)
		box.add_child(go)
		box.add_child(_label("The %s, %s · %s · %d cz" % [sum.ship, sum.where, sum.date, sum.purse], 13, true))
		box.add_child(HSeparator.new())
	if confirm != "":
		box.add_child(_label("Start again for %s? Your saved game will be lost." % confirm.capitalize(), 15))
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		var no := _button("Keep my game")
		var yes := _button("Start again", true)
		no.pressed.connect(func(): confirm = ""; _build())
		yes.pressed.connect(func(): _new(confirm, true))
		row.add_child(no)
		row.add_child(yes)
		box.add_child(row)
		return
	box.add_child(_label("A new game", 15))
	for n in [["portugal", "Portugal", "from Lisbon"], ["castile", "Castile", "from Seville"]]:
		var b := _button("%s, %s" % [n[1], n[2]], sum.is_empty() and n[0] == "portugal")
		b.pressed.connect(_new.bind(n[0], sum.is_empty()))
		box.add_child(b)

func _new(nation: String, sure: bool) -> void:
	if not sure:
		confirm = nation
		_build()
		return
	Game.start_new(nation)
	_play()

func _play() -> void:
	Game.speed = 1
	queue_free()
