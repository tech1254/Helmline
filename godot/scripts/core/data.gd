# The game's tables, loaded once from data/*.json (exported from the browser game by
# tests/tools/export_godot_data.mjs). Autoloaded as `Data`.
extends Node

var goods: Array = []          # [{id, name, unit, one, spoil, rot}]
var good_ids: PackedStringArray = []
var markets: Dictionary = {}   # port id -> {k, p: {good: [base, sold here?]}}
var economy: Dictionary = {}   # depth, goldK, spiceK, spread, pressureDays, driftDays, driftVol
var portuguese: PackedStringArray = []
var ports: Array = []
var port_by_id: Dictionary = {}
var world: Dictionary = {}
var hulls: Dictionary = {}
var hull_order: PackedStringArray = []
var groups: Array = []
var default_fit: Dictionary = {}
var tiers: Dictionary = {}
var routes: Dictionary = {}

func _ready() -> void:
	load_all()

static func read_json(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("Data: cannot open %s" % path)
		return null
	return JSON.parse_string(f.get_as_text())

func load_all() -> void:
	if not goods.is_empty():
		return
	goods = read_json("res://data/goods.json")
	for g in goods:
		good_ids.append(g.id)
	var m: Dictionary = read_json("res://data/markets.json")
	markets = m.markets
	portuguese = PackedStringArray(m.portuguese)
	economy = m
	ports = read_json("res://data/ports.json")
	for p in ports:
		port_by_id[p.id] = p
	world = read_json("res://data/world.json")
	var s: Dictionary = read_json("res://data/ships.json")
	hulls = s.hulls
	hull_order = PackedStringArray(s.order)
	groups = s.groups
	default_fit = s.defaultFit
	tiers = s.tiers

func load_routes() -> Dictionary:
	if routes.is_empty():
		routes = read_json("res://data/routes.json")
	return routes

func good(id: String) -> Dictionary:
	for g in goods:
		if g.id == id:
			return g
	return {}

func port(id: String) -> Dictionary:
	return port_by_id.get(id, {})
