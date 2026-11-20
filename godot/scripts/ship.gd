# A ship riding the sea: it sits on the wave under its hull, pitches and rolls with the slope,
# and sails ahead at its speed. A placeholder hull until the Trellis models arrive.
extends Node3D

@export var speed := 4.0      # metres a second
@export var turn := 0.08      # radians a second
@export var length := 6.0

func _process(delta: float) -> void:
	var t := Time.get_ticks_msec() / 1000.0
	rotation.y += turn * delta
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
