# Follows the ship from astern and above.
extends Camera3D

@export var target: NodePath
@export var back := 10.0
@export var up := 3.5
@export var side := 6.0
var foe: Node3D  # in a fight: frame both ships, from across your own deck

func _process(delta: float) -> void:
	var s := get_node_or_null(target) as Node3D
	if s == null:
		return
	if is_instance_valid(foe):
		var to := foe.global_position - s.global_position
		to.y = 0
		var d := to.length()
		var dir := to / maxf(d, 0.01)
		var mid := s.global_position + to * 0.5
		# from astern of both, so they lie side by side at the same distance; aimed below them so
		# they sit in the top half of the screen, clear of the fight panel
		var aft := s.global_transform.basis.z
		aft.y = 0
		aft = aft.normalized()
		var pos := mid + aft * (15.0 + d * 0.6) + Vector3.UP * (7.0 + d * 0.16)
		global_position = global_position.lerp(pos, 1.5 * delta)
		look_at(mid + Vector3.DOWN * (6.5 + d * 0.2))
		return
	var want := s.global_position + s.global_transform.basis.z * back + s.global_transform.basis.x * side + Vector3.UP * up
	global_position = global_position.lerp(want, 2.0 * delta)
	look_at(s.global_position + Vector3.UP * 3.0)
