# A fight at sea on screen (as fightview.js): both ships' hull, spirit and sails, the range between
# them, what she means to do, what happened last round, and what you can do now. Also the two
# choices around it: attack a galley you have run down (or let her go), and plunder one you have
# beaten. Sits over the sea view, where the ships themselves are seen (fight_scene.gd).
extends CanvasLayer

signal acted(lines: Array)  # a round was played: the sea view shows its gunfire

const ODDS := {"run": "to get away this round", "board": "to carry her", "demand": "that she strikes"}

var panel := PanelContainer.new()
var box := VBoxContainer.new()
var last: Array = []

func _ready() -> void:
	layer = 5
	panel.theme = Look.theme
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 1.0
	panel.anchor_bottom = 1.0
	panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	box.add_theme_constant_override("separation", 6)
	var m := MarginContainer.new()
	for k in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + k, 14)
	m.add_child(box)
	panel.add_child(m)
	add_child(panel)
	visible = false
	Game.encounter.connect(func(_e): last = []; show_now())
	get_viewport().size_changed.connect(_fit)
	_fit()

func _fit() -> void:
	var w := minf(860.0, get_viewport().get_visible_rect().size.x - 24)
	panel.custom_minimum_size.x = w
	panel.offset_left = -w / 2
	panel.offset_right = w / 2
	panel.offset_bottom = -12

func _clear() -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.queue_free()

func _label(t: String, size := 15, quiet := false, wrap := true) -> Label:
	var l := Label.new()
	l.text = t
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	if quiet:
		l.add_theme_color_override("font_color", Look.text_quiet)
	return l

func _button(t: String, primary := false) -> Button:
	var b := Button.new()
	b.text = t
	b.custom_minimum_size = Vector2(120, 40)
	if primary:
		b.add_theme_color_override("font_color", Color(1, 0.85, 0.55))
	return b

func show_now() -> void:
	visible = true
	_clear()
	var enc: Dictionary = Game.pending
	if Game.fight.is_empty() and not Game.spoils.is_empty():
		_plunder()
	elif Game.fight.is_empty():
		_hunted(enc)
	else:
		_fight(enc)
	_fit()

# You have run her down: attack, or let her go.
func _hunted(enc: Dictionary) -> void:
	var o := Game.hunt_odds()
	box.add_child(_label("You have run down %s" % ("a great galley" if enc.big else "a corsair galley"), 22))
	box.add_child(_label("%s off %s, caught before her rowers can get her away. You have the wind and the surprise." % ["A big Barbary galley, packed with fighting men," if enc.big else "A Barbary galley", enc.where]))
	box.add_child(_label("Your chances: about %d%%. Take her: her plunder, and the crown's bounty of %d cz. If she beats you off, your hull and crew are the worse for it." % [roundi(o.fight * 100), Pirates.BOUNTY.big if enc.big else Pirates.BOUNTY.galley], 14, true))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	var go := _button("Let her go")
	var at := _button("Attack", true)
	go.pressed.connect(func(): visible = false; Game.let_go())
	at.pressed.connect(func(): Game.attack())
	row.add_child(go)
	row.add_child(at)
	box.add_child(row)

func _bar(label: String, v: float) -> HBoxContainer:
	var r := HBoxContainer.new()
	var l := _label(label, 13, true, false)
	l.custom_minimum_size.x = 48
	var p := ProgressBar.new()
	p.max_value = 100
	p.value = clampf(v, 0, 100)
	p.show_percentage = false
	p.custom_minimum_size = Vector2(90, 12)
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	p.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var fill := StyleBoxFlat.new()
	fill.bg_color = Look.accent.lightened(0.25) if v < 30 else Color(0.86, 0.78, 0.6)
	p.add_theme_stylebox_override("fill", fill)
	var n := _label(str(maxi(0, roundi(v))), 13, false, false)
	n.custom_minimum_size.x = 28
	r.add_child(l)
	r.add_child(p)
	r.add_child(n)
	return r

func _side(s: Dictionary, you: bool) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 2)
	var spirit: String = "eager" if s.morale >= 70 else "steady" if s.morale >= 45 else "shaken" if s.morale >= 25 else "breaking"
	v.add_child(_label("The %s · %s crew %s" % [s.name, "your" if you else "her", spirit], 15))
	v.add_child(_bar("Hull", s.hull))
	v.add_child(_bar("Spirit", s.morale))
	v.add_child(_bar("Sails", s.rigging))
	return v

func _track(r: int) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	for i in 4:
		var l := _label(["Alongside", "Gunshot", "Long range", "Away"][i], 13, i != r, false)
		if i == r:
			l.add_theme_color_override("font_color", Color(1, 0.85, 0.55))
		h.add_child(l)
		if i < 3:
			h.add_child(_label("  ·  ", 13, true, false))
	return h

func _fight(enc: Dictionary) -> void:
	var F: Dictionary = Game.fight
	var done: bool = F.done != null
	var title := ""
	if done:
		var r := Fight.outcome(F)
		title = ("She is yours" if F.role == "attack" else "You have beaten them off") if r == "win" else "You are clear of them" if r == "clear" else "Taken" if r == "lose" else "Tribute paid" if r == "paid" else "She got away"
	elif enc.get("hunted", false):
		title = "Attacking %s" % ("a great galley" if enc.big else "a corsair galley")
	else:
		title = "A great corsair galley!" if enc.big else "Corsairs!"
	box.add_child(_label(title, 22))
	if F.round == 1 and last.is_empty() and not enc.get("hunted", false):
		box.add_child(_label("%s is closing on you off %s. Run for it, fight, or pay her %d cz to let you pass." % ["A big Barbary galley, packed with fighting men," if enc.big else "A Barbary galley, oars flashing,", enc.where, F.tribute]))
	var sides := HBoxContainer.new()
	sides.add_theme_constant_override("separation", 24)
	sides.add_child(_side(F.you, true))
	sides.add_child(_side(F.foe, false))
	box.add_child(sides)
	box.add_child(_track(mini(3, F.r)))
	for l in last:
		box.add_child(_label("— " + l, 14))
	if done:
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_END
		var c := _button("Continue", true)
		c.pressed.connect(_settle)
		row.add_child(c)
		box.add_child(row)
		return
	var intent := _label("Round %d of %d. %s" % [F.round, Fight.ROUNDS, F.intentText], 15)
	intent.add_theme_color_override("font_color", Color(1, 0.85, 0.55))
	box.add_child(intent)
	var grid := GridContainer.new()
	grid.columns = 3 if panel.custom_minimum_size.x > 640 else 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	for c in Fight.choices(F):
		var t: String = c.name
		if c.has("odds"):
			t += "\n%d%% %s" % [roundi(c.odds * 100), ODDS[c.id]]
		var b := _button(t, c.id in ["board", "run"])
		b.tooltip_text = c.note
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size.y = 46 if c.has("odds") else 36
		b.pressed.connect(func(): _act(c.id))
		grid.add_child(b)
	box.add_child(grid)
	var auto := Button.new()
	auto.flat = true
	auto.text = "Leave it to your sailing master"
	auto.tooltip_text = "He fights it out for you."
	auto.pressed.connect(func(): last = Game.fight_auto().slice(-6); acted.emit(last); show_now())
	box.add_child(auto)

func _act(id: String) -> void:
	last = Game.fight_act(id)
	acted.emit(last)
	show_now()

func _settle() -> void:
	var r := Game.settle_fight()
	if r.has("spoils"):
		show_now()
	else:
		visible = false

# A beaten galley alongside: plunder her, or let her go.
func _plunder() -> void:
	var sp: Dictionary = Game.spoils
	var goods := PackedStringArray()
	for it in sp.goods:
		var gd := Data.good(it.good)
		goods.append("%d %s of %s" % [it.qty, gd.one if it.qty == 1 else gd.unit, gd.name.to_lower()])
	box.add_child(_label("The galley is yours", 22))
	box.add_child(_label("Aboard her: %d cz%s. Room in your hold: %d. The crown's bounty: %d cz, paid at any Portuguese port." % [sp.cash, (", " + ", ".join(goods)) if not goods.is_empty() else "", Game.free_hold(), sp.bounty]))
	box.add_child(_label("Plundering corsairs makes your name feared on the Barbary coast: more of them will come looking for you. Letting her go keeps the seas calmer.", 13, true))
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	var spare := _button("Let her go")
	var take := _button("Plunder her", true)
	spare.pressed.connect(func(): visible = false; Game.plunder(false))
	take.pressed.connect(func(): visible = false; Game.plunder(true))
	row.add_child(spare)
	row.add_child(take)
	box.add_child(row)
