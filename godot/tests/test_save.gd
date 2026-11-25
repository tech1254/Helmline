# Saving and loading (game.gd): a game comes back exactly as it was left.
extends RefCounted

var runner

func test_round_trip() -> void:
	Game.new_game("castile")
	Game.S.purse = 1234.5
	Game.S.cargo.wine = 7
	Game.S.paid.wine = 63.0
	Game.S.hull = 81.25
	Game.S.ship.hull = "caravel"
	Game.S.ship.fit.guns = "bercos"
	Game.S.pirates.won = 2
	Game.S.pirates.galleys = [{"id": 4, "lon": -8.0, "lat": 33.0, "heading": 10.0, "big": true, "zone": "the Barbary coast", "until": 40.0, "seen": null}]
	Game.buy("wheat", 3)
	var price := Game.market.buy_price("palos", "wheat")
	runner.check(Game.save_game(), "saved")
	var before := var_to_str(Game.S)
	Game.new_game("portugal")
	runner.check(Game.load_game(), "loaded")
	runner.check(var_to_str(Game.S) == before, "the state comes back exactly")
	runner.check(typeof(Game.S.cargo.wine) == TYPE_INT and Game.S.cargo.wine == 7, "ints stay ints")
	runner.check(Game.market.buy_price("palos", "wheat") == price, "and the market where it was (%d)" % price)
	var sum := Game.save_summary()
	runner.check(sum.where == "in Palos" and sum.purse == int(Game.S.purse) and sum.nation == "castile", "the start screen's summary: %s" % [sum])

func test_old_save_gets_new_fields() -> void:
	Game.new_game("portugal")
	Game.S.erase("pirates")  # a save from before the corsairs
	Game.S.ship.erase("tropic")
	Game.save_game()
	Game.load_game()
	runner.check(Game.S.has("pirates") and Game.S.pirates.won == 0 and Game.S.ship.has("tropic"), "missing parts come from a fresh game")

func test_not_mid_fight() -> void:
	Game.new_game("portugal")
	Game.S.ship.docked = ""
	Game.S.ship.lon = -9.0
	Game.S.ship.lat = 33.0
	Game.save_game()
	Game.meet({"where": "the Barbary coast", "big": false, "strength": 1.0})
	runner.check(not Game.save_game(), "no saving in the middle of a fight")
	Game.fight_act("pay")
	Game.settle_fight()
	runner.check(Game.pending.is_empty() and Game.has_save(), "saved again once it is over")

func test_bad_save() -> void:
	var f := FileAccess.open(Game.save_path, FileAccess.WRITE)
	f.store_string("not a save")
	f.close()
	runner.check(not Game.load_game() and Game.save_summary().is_empty(), "a broken save is ignored, not loaded")
	Game.delete_save()
	runner.check(not Game.has_save(), "deleted")
