# The port: its picture, what it says of itself, and the market. Buy with a click (shift for
# ten), sell one or all. Shown beside the chart while the ship lies in port.
extends PanelContainer

@onready var pic: TextureRect = $Box/Picture
@onready var title: Label = $Box/Title
@onready var blurb: Label = $Box/Blurb
@onready var hold: Label = $Box/Hold
@onready var rows: GridContainer = $Box/Scroll/Market

func _ready() -> void:
	theme = Look.theme
	Game.changed.connect(refresh, CONNECT_DEFERRED)
	Game.docked.connect(func(_id): refresh())
	refresh()

func refresh() -> void:
	visible = not Game.at_sea()
	if not visible:
		return
	var id := Game.here()
	var p := Data.port(id)
	var path := "res://art/ports/%s.webp" % id
	pic.texture = load(path) if ResourceLoader.exists(path) else null
	pic.visible = pic.texture != null
	title.text = p.name
	blurb.text = p.get("blurb", "")
	hold.text = "Hold %d / %d · purse %d cz" % [Game.held(), int(Game.stats().hold), int(Game.S.purse)]
	if built_for != id:
		build(id)
	var obs := Game.market.observe(id)
	for g in Data.goods:
		if not cells.has(g.id):
			continue
		var o: Dictionary = obs[g.id]
		var have: int = Game.S.cargo[g.id]
		var c: Dictionary = cells[g.id]
		c.buy.text = ("%d" % o.buy) if o.buy != null else "—"
		c.buy.disabled = o.buy == null or Game.free_hold() == 0 or Game.S.purse < o.buy
		c.buy10.disabled = c.buy.disabled
		c.sell.text = "%d" % o.sell
		c.sell.disabled = have == 0
		c.sellall.disabled = have == 0
		c.held.text = ("%d @ %d" % [have, roundi(Game.avg_paid(g.id))]) if have else ""

var built_for := ""
var cells: Dictionary = {}

# One row per good, made once per port and updated in place after each trade.
func build(id: String) -> void:
	built_for = id
	cells.clear()
	for c in rows.get_children():
		rows.remove_child(c)
		c.queue_free()
	for h in ["Good", "Buy", "Sell", "Hold", "", ""]:
		var l := Label.new()
		l.text = h
		l.add_theme_font_size_override("font_size", 13)
		l.modulate = Color(1, 1, 1, 0.65)
		rows.add_child(l)
	for g in Data.goods:
		var gid: String = g.id
		var name := Label.new()
		name.text = g.name
		name.custom_minimum_size.x = 104
		rows.add_child(name)
		var b := Button.new()
		b.custom_minimum_size.x = 48
		b.tooltip_text = "Buy one"
		b.pressed.connect(func(): Game.buy(gid, 1))
		rows.add_child(b)
		var s := Button.new()
		s.custom_minimum_size.x = 48
		s.tooltip_text = "Sell one"
		s.pressed.connect(func(): Game.sell(gid, 1))
		rows.add_child(s)
		var hl := Label.new()
		hl.custom_minimum_size.x = 76  # wide enough for "25 @ 120": the buttons beside it never shift
		rows.add_child(hl)
		var b10 := Button.new()
		b10.text = "+10"
		b10.pressed.connect(func(): Game.buy(gid, 10))
		rows.add_child(b10)
		var sa := Button.new()
		sa.text = "Sell all"
		sa.custom_minimum_size.x = 64
		sa.pressed.connect(func(): Game.sell(gid, Game.S.cargo[gid]))
		rows.add_child(sa)
		cells[gid] = {"buy": b, "sell": s, "held": hl, "buy10": b10, "sellall": sa}
