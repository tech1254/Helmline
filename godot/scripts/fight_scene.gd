# The fight in the sea view: the galley on your beam, nearer or farther with the range, riding the
# same waves; smoke, flashes and splashes when the guns fire; boarders' grapnels when she comes
# alongside. Pure show: the rules are in fight.gd.
extends Node3D

const RANGE_M := [10.0, 30.0, 62.0, 160.0]  # alongside, gunshot, long range, away
var ship: Node3D
var foe: Node3D
var hull: Node3D
var dist := 260.0
var want := 110.0
var leaving := false
var length := 30.0

func begin(enc: Dictionary) -> void:
	end_now()
	ship = get_parent().get_node("Ship")
	foe = Node3D.new()
	foe.name = "Foe"
	hull = Node3D.new()
	foe.add_child(hull)
	var id := "greatgalley" if enc.get("big", false) else "galley"
	var m: Dictionary = ship.get_script().MODELS[id]
	var model: Node3D = load("res://art/ships/%s.glb" % m.file).instantiate()
	model.scale = Vector3.ONE * float(m.scale)
	model.position.y = float(m.y)
	model.rotation.y = deg_to_rad(float(m.yaw))
	hull.add_child(model)
	length = float(m.scale)
	add_child(foe)
	leaving = false
	dist = 120.0  # she comes into view
	want = RANGE_M[Game.fight.get("r", 1)] if not Game.fight.is_empty() else RANGE_M[1]
	_place(0.0, true)

func end_now() -> void:
	if foe:
		foe.queue_free()
	foe = null

# The fight is over: she pulls away (or lies beaten) and is gone.
func finish() -> void:
	if foe:
		leaving = true
		want = RANGE_M[3]

func _process(delta: float) -> void:
	if foe == null:
		return
	if not leaving and not Game.fight.is_empty():
		want = RANGE_M[mini(3, int(Game.fight.r))]
	dist = lerpf(dist, want, 0.8 * delta)
	_place(delta, false)
	if leaving and dist > RANGE_M[3] - 10:
		end_now()

# On your starboard beam, a little ahead, on a parallel course; riding the waves as your ship does.
func _place(delta: float, snap: bool) -> void:
	var b := ship.global_transform.basis
	var fwd := -b.z
	fwd.y = 0
	fwd = fwd.normalized()
	var right := Vector3(-fwd.z, 0, fwd.x)
	var target := ship.global_position + right * dist + fwd * (dist * 0.15)
	var t := Time.get_ticks_msec() / 1000.0
	var p := Vector2(target.x, target.z)
	var f2 := Vector2(fwd.x, fwd.z)
	var bow := Sea.height_at(p + f2 * length * 0.5, t)
	var stern := Sea.height_at(p - f2 * length * 0.5, t)
	target.y = (bow + stern) * 0.5
	foe.global_position = target if snap else foe.global_position.lerp(target, minf(1.0, 3.0 * delta))
	foe.global_rotation.y = ship.global_rotation.y
	hull.rotation.x = atan2(bow - stern, length)
	# she rows: a little side to side as the oars bite
	hull.rotation.z = 0.03 * sin(t * 2.2)

# The guns of a round: smoke and flame from the side that fired, splashes or hits at the other.
func volley(shots: Array) -> void:
	if foe == null:
		return
	var delay := 0.0
	for s in shots:
		var from: Node3D = ship if s.by_you else foe
		var to: Node3D = foe if s.by_you else ship
		get_tree().create_timer(delay).timeout.connect(_broadside.bind(from, to, float(s.hit), s.kind == "rigging"))
		delay += 0.9

func _broadside(from: Node3D, to: Node3D, hit: float, rigging: bool) -> void:
	if foe == null or not is_instance_valid(from) or not is_instance_valid(to):
		return
	var dir := (to.global_position - from.global_position)
	dir.y = 0
	dir = dir.normalized()
	var guns := 4
	for i in guns:
		var along := (-from.global_transform.basis.z).normalized() * (i - guns / 2.0) * 2.2
		var muzzle := from.global_position + along + dir * 2.0 + Vector3.UP * 2.2
		get_tree().create_timer(i * 0.12).timeout.connect(func():
			_flash(muzzle)
			_puff(muzzle, dir))
	# where the shot falls: splashes short of her, or on her (high, for chain shot into the rigging)
	var good := clampf(hit / 1.2, 0.1, 0.95)
	for i in 5:
		var land := to.global_position + (-to.global_transform.basis.z) * randf_range(-8, 8)
		var on_her := randf() < good
		if not on_her:
			land += -dir * randf_range(4, 14) + Vector3(randf_range(-4, 4), 0, randf_range(-4, 4))
		var when := 0.45 + i * 0.12
		get_tree().create_timer(when).timeout.connect(func():
			if on_her:
				_hit(land + Vector3.UP * (9.0 if rigging else 2.5))
			else:
				_splash(Vector3(land.x, 0.2, land.z)))

func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = c
	return m

func _ball(at: Vector3, r: float, c: Color) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = r
	sm.height = r * 2
	sm.radial_segments = 10
	sm.rings = 6
	mi.mesh = sm
	mi.material_override = _mat(c)
	add_child(mi)
	mi.global_position = at
	return mi

func _flash(at: Vector3) -> void:
	var l := OmniLight3D.new()
	l.light_color = Color(1, 0.7, 0.35)
	l.light_energy = 6.0
	l.omni_range = 14.0
	add_child(l)
	l.global_position = at
	var tw := create_tween()
	tw.tween_property(l, "light_energy", 0.0, 0.25)
	tw.tween_callback(l.queue_free)
	var f := _ball(at, 0.7, Color(1, 0.8, 0.4, 0.95))
	var tf := create_tween()
	tf.tween_property(f, "scale", Vector3.ONE * 0.1, 0.18)
	tf.tween_callback(f.queue_free)

func _puff(at: Vector3, dir: Vector3) -> void:
	for k in 3:
		var p := _ball(at + dir * k * 1.2, 0.7, Color(0.82, 0.8, 0.76, 0.42))
		var tw := create_tween().set_parallel()
		tw.tween_property(p, "scale", Vector3.ONE * (2.2 + 0.6 * k), 2.6)
		tw.tween_property(p, "global_position", at + dir * (3 + k * 2.5) + Vector3.UP * (1.5 + k), 2.6)
		tw.tween_property(p.material_override, "albedo_color:a", 0.0, 2.6)
		tw.chain().tween_callback(p.queue_free)

func _splash(at: Vector3) -> void:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.25
	cm.bottom_radius = 0.7
	cm.height = 1.0
	mi.mesh = cm
	mi.material_override = _mat(Color(0.95, 0.97, 1.0, 0.85))
	add_child(mi)
	mi.global_position = at
	mi.scale = Vector3(1, 0.1, 1)
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3(1.2, 5.0, 1.2), 0.25).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(mi, "position:y", at.y + 2.5, 0.25)
	tw.tween_property(mi, "scale", Vector3(1.8, 0.2, 1.8), 0.6).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(mi.material_override, "albedo_color:a", 0.0, 0.6)
	tw.tween_callback(mi.queue_free)

func _hit(at: Vector3) -> void:
	_flash(at)
	for k in 4:
		var p := _ball(at, 0.5, Color(0.35, 0.3, 0.26, 0.9))
		var to := at + Vector3(randf_range(-2, 2), randf_range(0.5, 3), randf_range(-2, 2))
		var tw := create_tween().set_parallel()
		tw.tween_property(p, "global_position", to, 0.9)
		tw.tween_property(p, "scale", Vector3.ONE * 2.5, 0.9)
		tw.tween_property(p.material_override, "albedo_color:a", 0.0, 0.9)
		tw.chain().tween_callback(p.queue_free)
