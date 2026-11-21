# The flagship riding the sea: she sits on the wave under her hull, pitches and rolls with the
# slope, and sails on her heading at the speed the wind gives her (from Game). A placeholder hull
# until the Trellis models arrive.
extends Node3D

@export var length := 6.0
@export var sea_path: NodePath = ^"../Sea"
const KNOT := 1.4  # metres a second on screen for each knot: brisk enough to see

# Each hull's model (Trellis, art/ships/<file>.glb), its size and how it sits. A hull with no
# model of its own uses the nearest one.
const MODELS := {
	"caravel": {"file": "caravel", "scale": 7.0, "y": 2.6, "yaw": 0.0},
}
const STANDS_IN := {"barca": "caravel", "largecaravel": "caravel", "armedcaravel": "caravel", "barinel": "caravel"}
var shown := ""

# Swap the model when the flagship's hull changes.
func show_hull(hull_id: String) -> void:
	var id := hull_id
	if not MODELS.has(id):
		id = STANDS_IN.get(hull_id, "caravel")
	if id == shown:
		return
	var m: Dictionary = MODELS[id]
	var path := "res://art/ships/%s.glb" % m.file
	if not ResourceLoader.exists(path):
		return
	shown = id
	var old := $Hull.get_node_or_null("Model")
	if old:
		$Hull.remove_child(old)
		old.queue_free()
	var model: Node3D = load(path).instantiate()
	model.name = "Model"
	model.scale = Vector3.ONE * float(m.scale)
	model.position.y = float(m.y)
	model.rotation.y = deg_to_rad(float(m.yaw))
	$Hull.add_child(model)

func _process(delta: float) -> void:
	show_hull(String(Game.S.ship.hull))
	var t := Time.get_ticks_msec() / 1000.0
	var speed := 0.0
	if Game.at_sea():
		var want := -deg_to_rad(float(Game.S.ship.heading))
		rotation.y = lerp_angle(rotation.y, want, 1.5 * delta)
		if Game.speed > 0:
			speed = float(Game.wind_now().knots) * KNOT
	position += -transform.basis.z * speed * delta
	var p := Vector2(position.x, position.z)
	var fwd := Vector2(-transform.basis.z.x, -transform.basis.z.z).normalized()
	var side := Vector2(fwd.y, -fwd.x)
	var bow := Sea.height_at(p + fwd * length * 0.5, t)
	var stern := Sea.height_at(p - fwd * length * 0.5, t)
	var port := Sea.height_at(p + side * 1.5, t)
	var stbd := Sea.height_at(p - side * 1.5, t)
	position.y = (bow + stern + port + stbd) * 0.25
	$Hull.rotation.x = lerp($Hull.rotation.x, atan2(bow - stern, length), 4.0 * delta)
	$Hull.rotation.z = lerp($Hull.rotation.z, atan2(port - stbd, 3.0), 4.0 * delta)
	# the sea goes with her, a whole quad at a time so the waves stay put
	var sea := get_node_or_null(sea_path) as Node3D
	if sea:
		sea.position = Vector3(snappedf(position.x, 2.0), 0, snappedf(position.z, 2.0))
