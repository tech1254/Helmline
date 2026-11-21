# The flagship riding the sea: she sits on the wave under her hull, pitches and rolls with the
# slope, and sails on her heading at the speed the wind gives her (from Game). A placeholder hull
# until the Trellis models arrive.
extends Node3D

@export var length := 6.0
@export var sea_path: NodePath = ^"../Sea"
const KNOT := 1.4  # metres a second on screen for each knot: brisk enough to see

func _process(delta: float) -> void:
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
