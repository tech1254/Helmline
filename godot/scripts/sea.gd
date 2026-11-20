# The height of the sea at a point, matching shaders/sea.gdshader, so ships ride the same waves
# the player sees.
class_name Sea
extends RefCounted

const DIR: Array[Vector2] = [Vector2(1.0, 0.2), Vector2(0.6, 1.0), Vector2(-0.4, 0.9), Vector2(0.9, -0.5)]
const LEN: Array[float] = [22.0, 13.0, 7.0, 4.0]
const AMP: Array[float] = [1.0, 0.55, 0.28, 0.12]
const HEIGHT := 0.6

static func height_at(p: Vector2, t: float) -> float:
	var h := 0.0
	for i in DIR.size():
		var d: Vector2 = DIR[i].normalized()
		var k := TAU / LEN[i]
		var c := sqrt(9.8 / k)
		h += AMP[i] * sin(k * (d.dot(p) - c * t * 0.6))
	return h * HEIGHT
