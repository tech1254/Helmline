# Buying and selling through Game: purse, hold, average cost, and cargo spoiling at sea.
extends RefCounted

var runner

func test_buy_sell() -> void:
	Game.new_game("portugal")
	var m := Game.market
	for p in m.drift:
		for g in m.drift[p]:
			m.drift[p][g] = 0.0
	var purse: float = Game.S.purse
	var price := m.buy_price("lisbon", "wine")
	var n := Game.buy("wine", 10)
	runner.check(n == 10, "bought 10 wine (%d)" % n)
	runner.check(Game.S.purse < purse - price * 9, "paid for it")
	runner.check(Game.free_hold() == int(Game.stats().hold) - 10, "hold filled")
	runner.check(Game.buy("gold", 1) == 0, "Lisbon sells no gold")
	var c := Game.buy("cloth", 10)
	runner.check(c == 10, "then 10 cloth (%d, purse %d, free %d)" % [c, Game.S.purse, Game.free_hold()])
	Game.sell("cloth", 10)
	var avg := Game.avg_paid("wine")
	var inc := Game.sell("wine", 4)
	runner.check(inc > 0 and Game.S.cargo.wine == 6, "sold 4")
	runner.check(absf(Game.avg_paid("wine") - avg) < 1e-6, "the rest keeps its average cost")
	runner.check(Game.buy("wine", 1000) <= Game.free_hold() + 1000, "never more than the hold")
	runner.check(Game.held() <= int(Game.stats().hold), "hold never overfull (%d)" % Game.held())

func test_spoil() -> void:
	Game.new_game("portugal")
	Game.S.cargo.wine = 20
	Game.S.paid.wine = 200.0
	Game.S.ship.docked = ""
	Game.spoil(30.0)
	runner.check(Game.S.cargo.wine < 20 and Game.S.cargo.wine > 15, "wine turns at sea (%d left)" % Game.S.cargo.wine)
	Game.S.cargo.gold = 5
	Game.spoil(100.0)
	runner.check(Game.S.cargo.gold == 5, "gold keeps")
