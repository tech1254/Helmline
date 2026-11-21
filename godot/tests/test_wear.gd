# The hull wears at sea and is put right in port (wear.gd, parity with public/js/wear.js).
extends RefCounted

var runner

func test_quotes() -> void:
	# caravel: 6 cz a point (0.003 x 1950 = 5.85 caps it), 5 points a day in a yard
	var q := Wear.yard_quote("caravel", 70.0, 0.0)
	runner.check(q.to == 100 and q.pts == 30.0 and q.cost == int(ceil(30 * 5.85)) and q.days == 6, "yard quote %s" % q)
	var b := Wear.beach_quote("caravel", 70.0, 0.0)
	runner.check(b.to == 80 and b.days == 4 and b.cost == int(ceil(10 * 0.4 * 5.85)), "beach quote %s" % b)
	runner.check(Wear.sound_cap("caravel", 15.0) == 50 and Wear.sound_cap("caravel", 5.0) == 100, "an old hull can't be made sound")
	runner.check(absf(Wear.wear_per_day(38.7, "caravel", 0.0) - 0.08) < 1e-9 and absf(Wear.wear_per_day(14.0, "caravel", 0.0) - 0.2) < 1e-9, "tropics wear faster")

func test_wear_and_repair() -> void:
	Game.new_game("portugal")
	Game.rng.seed = 7
	var plan := Game.plan_to("lagos")
	Game.set_sail(plan)
	var guard := 0
	while Game.at_sea() and guard < 5000:
		Game.advance(0.2)
		guard += 1
	runner.check(Game.here() == "lagos", "made Lagos")
	runner.check(Game.S.hull < 100.0, "she wore on the way (%.2f)" % Game.S.hull)
	Game.S.hull = 50.0
	Game.S.purse = 5000.0
	var q := Game.repair_quote()
	var day: float = Game.S.day
	runner.check(Game.has_yard() and Game.repair(), "the Lagos yard repairs her")
	runner.check(Game.S.hull == 100.0 and absf(Game.S.purse - (5000.0 - q.cost - q.days * float(Game.stats().upkeep))) < 1e-6, "sound again, paid for, wages through the work (%s)" % q)
	runner.check(absf(Game.S.day - day - q.days) < 1e-6, "the days pass in port")
	runner.check(not Game.repair(), "nothing left to repair")

func test_leak() -> void:
	Game.new_game("portugal")
	Game.S.cargo.wine = 20
	Game.S.paid.wine = 180.0
	Game.S.hull = 40.0  # leak share (60-40)/200 = 10%
	Game.arrive("lagos")
	runner.check(Game.S.cargo.wine == 18, "sea water ruined two casks (%d)" % Game.S.cargo.wine)
