# Follows the ship from astern and above.
extends Camera3D

@export var target: NodePath
@export var back := 10.0
@export var up := 3.5
@export var side := 6.0

func _process(delta: float) -> void:
	var s := get_node_or_null(target) as Node3D
	if s == null:
		return
	var want := s.global_position + s.global_transform.basis.z * back + s.global_transform.basis.x * side + Vector3.UP * up
	global_position = global_position.lerp(want, 2.0 * delta)
	look_at(s.global_position + Vector3.UP * 3.0)
