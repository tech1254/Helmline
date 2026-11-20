# Follows the ship from astern and above.
extends Camera3D

@export var target: NodePath
@export var back := 16.0
@export var up := 7.0

func _process(delta: float) -> void:
	var s := get_node_or_null(target) as Node3D
	if s == null:
		return
	var want := s.global_position + s.global_transform.basis.z * back + Vector3.UP * up
	global_position = global_position.lerp(want, 2.0 * delta)
	look_at(s.global_position + Vector3.UP * 1.5)
