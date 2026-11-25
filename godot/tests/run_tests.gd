# Headless tests for the Godot edition: godot --headless --path godot -s tests/run_tests.gd
# Each test_*.gd in this folder has methods named test_*; a failed check prints FAIL and the
# run exits 1.
extends SceneTree

var failures := 0
var checks := 0

func _initialize() -> void:
	var data = root.get_node_or_null("Data")
	if data == null:
		data = load("res://scripts/core/data.gd").new()
		data.name = "Data"
		root.add_child(data)
	data.load_all()
	# the tests save to their own file, never over a game in play
	var game = root.get_node_or_null("Game")
	if game:
		game.save_path = "user://tests.save"
		game.delete_save()
	# every script compiles
	for path in scripts_under("res://scripts"):
		check(load(path) != null, "compiles: " + path)
	var dir := DirAccess.open("res://tests")
	var names: Array = []
	for f in dir.get_files():
		if f.begins_with("test_") and f.ends_with(".gd"):
			names.append(f)
	names.sort()
	for f in names:
		var t = load("res://tests/" + f).new()
		t.runner = self
		for m in t.get_method_list():
			if String(m.name).begins_with("test_"):
				var before := failures
				var n0 := checks
				t.call(m.name)
				if checks == n0:
					failures += 1
					print("  FAIL: no checks ran (a script error?)")
				print("%s %s.%s" % ["ok  " if failures == before else "FAIL", f.get_basename(), m.name])
	print("%d checks, %d failed" % [checks, failures])
	quit(1 if failures else 0)

func check(ok: bool, what: String) -> void:
	checks += 1
	if not ok:
		failures += 1
		print("  FAIL: " + what)

func scripts_under(path: String) -> Array:
	var out: Array = []
	var d := DirAccess.open(path)
	for f in d.get_files():
		if f.ends_with(".gd"):
			out.append(path + "/" + f)
	for sub in d.get_directories():
		out += scripts_under(path + "/" + sub)
	return out
