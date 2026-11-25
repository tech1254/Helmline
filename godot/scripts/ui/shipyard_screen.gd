# The shipyard (as the browser's yard screen): your ship turning on the stocks, her figures as she
# is and as she would be, and the yard's options by tab: hull, rig and sails, arms and stores,
# colours; in the home yard (and the northern yards) new ships too. Choose, see the bill, commission
# the work. Time stands still while the yard is open.
extends CanvasLayer

const STATS := [["knots", "Speed", "%.1f kn"], ["up", "Into the wind", "%d%%"], ["hold", "Hold", "%d"], ["upkeep", "Wages", "%d cz a day"], ["fight", "In a fight", "+%d%%"]]

var root := PanelContainer.new()
var left := VBoxContainer.new()
var right := VBoxContainer.new()
var tab := "hull"
var draft: Dictionary = {}
var name_edit := LineEdit.new()
var viewport := SubViewport.new()
var model_holder := Node3D.new()
var shown_model := ""
var speed_before := 1

func _ready() -> void:
	add_to_group("yard_screen")
	layer = 8
	visible = false
	root.theme = Look.theme
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(Look.panel_bg, 1.0)
	bg.set_corner_radius_all(6)
	root.add_theme_stylebox_override("panel", bg)
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 12
	root.offset_top = 12
	root.offset_right = -12
	root.offset_bottom = -12
	var m := MarginContainer.new()
	for k in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + k, 14)
	root.add_child(m)
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 18)
	m.add_child(cols)
	left.custom_minimum_size.x = 330
	left.add_theme_constant_override("separation", 6)
	cols.add_child(left)
	var scroll := ScrollContainer.new()
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	scroll.add_child(right)
	cols.add_child(scroll)
	add_child(root)
	_build_stage()
	Game.changed.connect(func(): if visible: _render(), CONNECT_DEFERRED)

# The ship on the stocks: her model, turning slowly, in a little world of its own.
func _build_stage() -> void:
	viewport.own_world_3d = true
	viewport.size = Vector2i(330, 200)
	viewport.transparent_bg = false
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color(0.82, 0.78, 0.68)
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color(1, 0.96, 0.9)
	env.environment.ambient_light_energy = 0.7
	viewport.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, 40, 0)
	sun.light_energy = 1.2
	viewport.add_child(sun)
	var cam := Camera3D.new()
	cam.fov = 40
	var at := Vector3(0, 0.3, 2.1)
	cam.transform = Transform3D(Basis.looking_at(Vector3(0, 0.02, 0) - at), at)
	viewport.add_child(cam)
	viewport.add_child(model_holder)

func _process(delta: float) -> void:
	if visible:
		model_holder.rotation.y += 0.35 * delta

func _show_model(hull_id: String) -> void:
	var models: Dictionary = load("res://scripts/ship.gd").MODELS
	var stand: Dictionary = load("res://scripts/ship.gd").STANDS_IN
	var id := hull_id if models.has(hull_id) else String(stand.get(hull_id, "caravel"))
	if id == shown_model:
		return
	shown_model = id
	for c in model_holder.get_children():
		c.queue_free()
	var m: Dictionary = models[id]
	var model: Node3D = load("res://art/ships/%s.glb" % m.file).instantiate()
	model.rotation.y = deg_to_rad(float(m.yaw))
	model_holder.add_child(model)

# ---- Open and close ----------------------------------------------------------------------------

func open() -> void:
	if Game.yard_here() == "":
		return
	speed_before = Game.speed if Game.speed else 1
	Game.speed = 0
	draft = Ships.normal_fit(Game.S.ship.hull, Game.S.ship.fit).duplicate()
	name_edit.text = Game.S.ship.name
	tab = "hull"
	visible = true
	_render()

func close() -> void:
	visible = false
	Game.speed = speed_before

func _unhandled_input(e: InputEvent) -> void:
	if visible and e.is_action_pressed("ui_cancel"):
		close()
		get_viewport().set_input_as_handled()

# ---- Drawing -----------------------------------------------------------------------------------

func _clear(box: Container) -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.queue_free()

func _label(t: String, size := 14, quiet := false, wrap := true) -> Label:
	var l := Label.new()
	l.text = t
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_font_size_override("font_size", size)
	if quiet:
		l.add_theme_color_override("font_color", Look.text_quiet)
	return l

func _gold(c: Control) -> Control:
	c.add_theme_color_override("font_color", Color(1, 0.85, 0.55))
	return c

func _fmt(n) -> String:
	var s := str(int(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.right(3) + out
		s = s.left(s.length() - 3)
	return s + out

func _render() -> void:
	draft = Ships.normal_fit(Game.S.ship.hull, draft)
	_render_left()
	_render_right()

func _stat_value(st: Dictionary, key: String) -> float:
	match key:
		"up":
			return float(st.up) * 100.0
		"fight":
			return float(st.fight) * 100.0
		_:
			return float(st[key])

func _stats_grid(now: Dictionary, after: Dictionary) -> GridContainer:
	var g := GridContainer.new()
	g.columns = 2
	g.add_theme_constant_override("h_separation", 14)
	for s in STATS:
		g.add_child(_label(s[1], 13, true, false))
		var a := _stat_value(now, s[0])
		var b := _stat_value(after, s[0])
		var t: String = s[2] % a
		if absf(a - b) > 0.001:
			t += "  to  " + s[2] % b
		var l := _label(t, 13, false, false)
		if absf(a - b) > 0.001:
			var better: bool = (b > a) != (s[0] == "upkeep")
			l.add_theme_color_override("font_color", Color(0.7, 0.9, 0.6) if better else Color(1, 0.6, 0.5))
		g.add_child(l)
	return g

func _render_left() -> void:
	# the name box and the stage are kept from one drawing to the next: take them out first
	for keep in [name_edit, viewport]:
		if keep.get_parent():
			keep.get_parent().remove_child(keep)
	_clear(left)
	var S := Game.S
	var here: String = Data.port(Game.here()).name
	var head := HBoxContainer.new()
	var title := _label("The %s shipyard" % here if Game.home_yard() else "The shipwrights of %s" % here, 20, false, false)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	left.add_child(head)
	left.add_child(_label("Refits, new ships and orders for ships not yet built." if Game.home_yard() else "Refits, and the northern holk." if Data.foreign_yards.has(Game.here()) else "Refits. New ships only in %s." % Data.port(Shipyard.home(S)).name, 12, true))
	_show_model(S.ship.hull)
	var holder := SubViewportContainer.new()
	holder.stretch = true
	holder.custom_minimum_size = Vector2(330, 200)
	holder.add_child(viewport)
	left.add_child(holder)
	var row := HBoxContainer.new()
	name_edit.max_length = 28
	name_edit.custom_minimum_size.x = 170
	name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_edit.placeholder_text = "Her name"
	row.add_child(name_edit)
	var rn := Button.new()
	rn.text = "Paint her name"
	rn.pressed.connect(func(): Game.rename(name_edit.text))
	row.add_child(rn)
	left.add_child(row)
	left.add_child(_label("A %s · hull %d%% · %s" % [String(Data.hulls[S.ship.hull].name).to_lower(), roundi(S.hull), _age_text()], 12, true))
	left.add_child(_stats_grid(Ships.stats(S.ship), Ships.stats({"hull": S.ship.hull, "fit": draft}) if tab != "new" else Ships.stats(S.ship)))
	var q := Game.repair_quote()
	if q.pts >= 3:
		var b := Button.new()
		b.text = "Repair her hull: %d cz, %d days" % [q.cost, q.days]
		b.disabled = S.purse < q.cost
		b.pressed.connect(func(): Game.repair())
		left.add_child(b)
	left.add_child(_label("Purse %s cz" % _fmt(S.purse), 14))
	var close_b := Button.new()
	close_b.text = "Back to the port"
	close_b.custom_minimum_size.y = 40
	close_b.pressed.connect(close)
	left.add_child(close_b)

func _age_text() -> String:
	var years := Wear.service_years(Game.S.ship, Game.S.day)
	var f := Shipyard.life_share(Game.S.ship.hull, years)
	var how := "past her serviceable life" if f >= 1 else "growing old" if f >= 0.7 else "in her prime" if f >= 0.35 else "still new"
	return "%s, %s" % ["less than a year in service" if years < 1 else "%d years in service" % int(years), how]

func _render_right() -> void:
	_clear(right)
	var S := Game.S
	# orders ready in the home yard
	if Game.home_yard():
		for i in S.yard.orders.size():
			var o: Dictionary = S.yard.orders[i]
			var what: String = ("Your new %s" % String(Data.hulls[o.hull].name).to_lower()) if o.kind == "hull" else String(Ships.choice(o.group, o.choice).name)
			var r := HBoxContainer.new()
			var p := Shipyard.progress(S, o)
			var l := _label("%s: %s.%s" % [what, Shipyard.stage_text(p), (" %s cz due." % _fmt(o.price - o.paid)) if p >= 1 else " Ready %s." % Calendar.fmt_date(o.due)], 13)
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			r.add_child(l)
			if p >= 1:
				var b := Button.new()
				b.text = "Take delivery"
				b.pressed.connect(Game.deliver.bind(i))
				r.add_child(_gold(b))
			right.add_child(r)
	# tabs
	var tabs := HBoxContainer.new()
	var all: Array = Data.tabs.duplicate()
	if not Shipyard.hulls_here(S, Game.here()).is_empty():
		all.append(["new", "New ship"])
	for t in all:
		var b := Button.new()
		b.text = t[1]
		b.toggle_mode = true
		b.button_pressed = tab == t[0]
		b.pressed.connect(func(): tab = t[0]; _render())
		tabs.add_child(b)
	right.add_child(tabs)
	if tab == "new":
		_new_ships()
		return
	var groups := Ships.groups_for(S.ship.hull).filter(func(g): return g.tab == tab)
	var cur := Ships.normal_fit(S.ship.hull, S.ship.fit)
	for g in groups:
		right.add_child(_label(g.name, 15))
		var grid := GridContainer.new()
		grid.columns = 2
		grid.add_theme_constant_override("h_separation", 8)
		grid.add_theme_constant_override("v_separation", 6)
		for c in Ships.choices_for(g, S.ship.hull):
			grid.add_child(_option(g, c, cur))
		right.add_child(grid)
	if groups.is_empty():
		right.add_child(_label("Nothing to change here on this hull.", 13, true))
	_bill()

func _option(g: Dictionary, c: Dictionary, cur: Dictionary) -> Button:
	var S := Game.S
	var av := Shipyard.availability(S, c)
	var price := Shipyard.price_for(S.ship.hull, c)
	var current: bool = cur[g.id] == c.id
	var ordered := Shipyard.has_order(S, "fit", c.id)
	var lock: bool = g.id == "rig" and not Game.home_yard()
	var note := ""
	if current:
		note = "fitted now"
	elif ordered:
		note = "on order"
	elif av.ok == "no":
		note = av.why
	elif av.ok == "order":
		note = "order now, a third down; delivered %d" % c.year
	elif price:
		note = "%s cz · %d %s" % [_fmt(price), c.get("days", 0), "day" if int(c.get("days", 0)) == 1 else "days"]
	elif c.get("days", 0):
		note = "free · %d %s" % [c.days, "day" if c.days == 1 else "days"]
	else:
		note = "free"
	var b := Button.new()
	b.toggle_mode = true
	b.button_pressed = draft[g.id] == c.id
	b.text = "%s\n%s" % [c.name, note]
	b.tooltip_text = c.get("note", "")
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.custom_minimum_size = Vector2(200, 50)
	b.disabled = (av.ok == "no" and not current) or (ordered and not current) or (lock and not current)
	b.pressed.connect(func(): draft[g.id] = c.id; _render())
	return b

func _bill() -> void:
	var S := Game.S
	var q := Shipyard.quote_fit(S, draft)
	right.add_child(HSeparator.new())
	if q.error != "":
		right.add_child(_label(q.error, 13))
		return
	if q.lines.is_empty():
		right.add_child(_label("Choose what to change. Hover an option for what it does.", 13, true))
		return
	for l in q.lines:
		var r := HBoxContainer.new()
		var a := _label("%s: %s%s" % [l.g.name, l.c.name, " (ordered)" if l.get("order", false) else ""], 13, false, false)
		a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		r.add_child(a)
		r.add_child(_label(("%s cz now" % _fmt(roundi(l.price / 3.0))) if l.get("order", false) else ("%s cz" % _fmt(l.price)) if l.price else "free", 13, false, false))
		right.add_child(r)
	var total: int = q.cost + q.down
	var row := HBoxContainer.new()
	var days := _label(("%d %s in the yard" % [q.days, "day" if q.days == 1 else "days"]) if q.days else "Ordered for later", 13, true, false)
	days.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(days)
	var reset := Button.new()
	reset.text = "Start again"
	reset.pressed.connect(func(): draft = Ships.normal_fit(S.ship.hull, S.ship.fit).duplicate(); _render())
	row.add_child(reset)
	var go := Button.new()
	go.text = "Commission the work: %s cz" % _fmt(total) if q.days or q.ordered.is_empty() else "Place the order: %s cz" % _fmt(total)
	go.disabled = S.purse < total
	go.pressed.connect(func():
		if Game.commission(draft):
			draft = Ships.normal_fit(S.ship.hull, S.ship.fit).duplicate()
		_render())
	row.add_child(_gold(go))
	right.add_child(row)
	if S.purse < total:
		right.add_child(_label("You need %s cz in your purse." % _fmt(total), 12, true))

func _new_ships() -> void:
	var S := Game.S
	var value := Shipyard.trade_in_value(S)
	var years := Wear.service_years(S.ship, S.day)
	right.add_child(_label("Trade up your flagship: the yard takes the %s in part exchange for %s cz (half her hull price new, less for her age and any repairs). Her fittings stay with her; her name and colours go with you." % [S.ship.name, _fmt(value)], 13, true))
	for id in Shipyard.hulls_here(S, Game.here()):
		var H: Dictionary = Data.hulls[id]
		var av := Shipyard.availability(S, H)
		var st := Ships.stats({"hull": id})
		var mine: bool = id == S.ship.hull
		var card := VBoxContainer.new()
		var head := HBoxContainer.new()
		var t := _label("%s · %s cz" % [H.name, _fmt(H.price)], 15, false, false)
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		head.add_child(t)
		var net: int = int(H.price) - value
		if mine and Shipyard.life_share(id, years) < 0.5:
			head.add_child(_label("Your ship", 13, true, false))
		elif Shipyard.has_order(S, "hull", id):
			head.add_child(_label("On order", 13, true, false))
		elif av.ok == "yes":
			var b := Button.new()
			var fits := Game.held() <= int(st.hold)
			b.text = ("%s: %s cz" % ["Trade up" if int(H.price) > int(Data.hulls[S.ship.hull].price) else "Exchange", _fmt(net)]) if net >= 0 else "Exchange: you receive %s cz" % _fmt(-net)
			b.disabled = S.purse < net or not fits
			if not fits:
				b.tooltip_text = "Lighten your hold to %d first." % st.hold
			b.pressed.connect(func(): Game.trade_up(id, name_edit.text.strip_edges()); _render())
			head.add_child(_gold(b))
		elif av.ok == "order":
			var b := Button.new()
			var down := roundi(float(H.price) / 3.0)
			b.text = "Order: %s cz down" % _fmt(down)
			b.disabled = S.purse < down or not Game.home_yard()
			b.pressed.connect(func(): Game.order_hull(id, name_edit.text.strip_edges() if name_edit.text.strip_edges() != S.ship.name else ""); _render())
			head.add_child(_gold(b))
		else:
			head.add_child(_label(String(av.why).capitalize().left(1) + String(av.why).substr(1) + ".", 12, true, false))
		card.add_child(head)
		card.add_child(_label(H.blurb, 12, true))
		card.add_child(_label("%.1f knots · %d%% into the wind · hold %d · wages %d cz a day" % [st.knots, roundi(st.up * 100), st.hold, st.upkeep], 12, false))
		right.add_child(card)
		right.add_child(HSeparator.new())
