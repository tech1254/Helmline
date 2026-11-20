# Routes between ports come from the same table as the browser game, rivers included.
extends RefCounted

var runner
var fx: Dictionary = Data.read_json("res://tests/fixtures.json")

func test_routes() -> void:
	for c in fx.routes:
		var got = Nav.port_route(c.a, c.b, c.skill, c.coastal)
		if c.route == null:
			runner.check(got == null, "%s-%s should have no route" % [c.a, c.b])
			continue
		runner.check(got != null and got.size() == c.route.size(), "%s-%s skill %s coastal %s: %s points, want %s" % [c.a, c.b, c.skill, c.coastal, (got.size() if got != null else -1), c.route.size()])
		if got != null and got.size() == c.route.size():
			var same := true
			for i in got.size():
				same = same and is_equal_approx(float(got[i][0]), float(c.route[i][0])) and is_equal_approx(float(got[i][1]), float(c.route[i][1])) and (got[i].size() > 2) == (c.route[i].size() > 2)
			runner.check(same, "%s-%s waypoints differ" % [c.a, c.b])
