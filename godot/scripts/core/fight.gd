# A fight at sea (port of public/js/fight.js): four rounds at most, an action each round, the same
# system whichever side you are on. The other ship's intent is shown before you choose. Pure rules:
# every roll comes from `rand` (a Callable returning 0..1), so the tests can replay the browser's.
class_name Fight
extends RefCounted

const ROUNDS := 4
const ALONGSIDE := 0
const CLOSE := 1
const FAR := 2
const GONE := 3
const RANGE_NAMES := ["alongside", "within gunshot", "at long range", "out of reach"]

# The other ships: hull (0-100), knots, guns (as the yards' fight bonus), men (1 = a caravel's crew
# of sailors), morale (0-100); galleys row, so the wind does not stop them.
const FOES := {
	"galley": {"name": "corsair galley", "hull": 70.0, "knots": 5.1, "guns": 0.04, "men": 2.1, "morale": 62.0, "rows": true, "tribute": true},
	"biggalley": {"name": "great corsair galley", "hull": 85.0, "knots": 4.9, "guns": 0.06, "men": 2.9, "morale": 68.0, "rows": true, "tribute": true},
	"caravel": {"name": "caravel", "hull": 100.0, "knots": 4.8, "guns": 0.0, "men": 0.9, "morale": 45.0},
	"nau": {"name": "nau", "hull": 100.0, "knots": 4.8, "guns": 0.1, "men": 1.3, "morale": 50.0},
	"carrack": {"name": "carrack", "hull": 100.0, "knots": 4.6, "guns": 0.15, "men": 1.6, "morale": 55.0},
	"merchantman": {"name": "armed merchantman", "hull": 100.0, "knots": 5.2, "guns": 0.25, "men": 1.4, "morale": 60.0},
	"hunter": {"name": "armed caravel", "hull": 100.0, "knots": 5.7, "guns": 0.2, "men": 1.8, "morale": 70.0},
	"warship": {"name": "warship", "hull": 100.0, "knots": 5.5, "guns": 0.3, "men": 2.4, "morale": 72.0},
}

const ACTIONS := {
	"close": {"side": "attack", "name": "Close in", "at": [CLOSE, FAR], "note": "Bear down on her to bring her within reach."},
	"rigging": {"side": "attack", "name": "Rake her rigging", "at": [CLOSE, FAR], "note": "Chain and bar shot into her sails: she cannot run, but it does her hull little harm."},
	"fire": {"side": "attack", "name": "Fire into her", "at": [ALONGSIDE, CLOSE, FAR], "note": "Into her hull and deck: it shakes her crew. Weak at long range unless you carry long guns."},
	"board": {"side": "attack", "name": "Grapple and board", "at": [ALONGSIDE, CLOSE], "note": "Lay her alongside and take her with your men. Best once her crew is shaken."},
	"demand": {"side": "attack", "name": "Call on her to strike", "at": [ALONGSIDE, CLOSE], "note": "Demand her surrender. A beaten or outmatched crew may give up without a fight."},
	"run": {"side": "defend", "name": "Run", "at": [ALONGSIDE, CLOSE, FAR], "note": "Crowd on sail. A faster ship gets away; a slower one is caught tired."},
	"turn": {"side": "defend", "name": "Turn and fire", "at": [ALONGSIDE, CLOSE, FAR], "note": "Bring your guns to bear: a full broadside, but she gains on you."},
	"repel": {"side": "defend", "name": "Repel boarders", "at": [ALONGSIDE, CLOSE, FAR], "note": "Every man to the rail with pikes and crossbows: twice as strong against boarders, wasted if none come."},
	"pay": {"side": "defend", "name": "Pay tribute", "at": [ALONGSIDE, CLOSE, FAR], "note": "Corsairs will take money to let you pass."},
	"strike": {"side": "defend", "name": "Strike your colours", "at": [ALONGSIDE, CLOSE, FAR], "note": "Surrender. They take what they came for."},
}

const INTENT := {
	"run": "She is crowding on sail to get away.",
	"close": "She is bearing down on you.",
	"board": "Her men crowd the rail with grapnels: she means to board.",
	"fire": "She is running out her guns.",
	"turn": "She is putting her helm over to bring her guns round.",
	"repel": "Her crew line the rail with pikes and crossbows.",
	"strike": "Her crew look to their captain: they have had enough.",
	"flee": "She is falling away: they have had enough of you.",
	"rigging": "Her gunners are loading chain shot.",
}

# What your flagship brings to a fight. `won`: corsair fights won before (they steady the crew).
static func your_side(ship: Dictionary, hull: float, won: int, fight_perk := 0.0) -> Dictionary:
	var st := Ships.stats(ship)
	var h := Ships.hull_of(ship)
	var fit := Ships.normal_fit(h.id, ship.get("fit", {}))
	var guns := float(Ships.choice("guns", fit.guns).get("fight", 0)) + float(h.get("fight", 0))
	var men_fit := float(Ships.choice("crew", fit.crew).get("fight", 0))
	return {
		"name": ship.get("name", "ship"), "you": true, "hull": hull, "knots": st.knots * (0.6 + 0.4 * hull / 100.0), "guns": guns,
		"men": (0.7 + 0.3 * float(h.get("size", 1))) * (1 + men_fit * 5), "nets": float(st.get("guard", 0.0)),
		"morale": clampf(58 + 2 * mini(won, 8) + 120 * fight_perk, 40, 92), "rigging": 100.0,
	}

# The other side, made stronger by `armed` (escorts and soldiers aboard: 0-2).
static func foe_side(kind: String, armed := 0.0, foe_name := "") -> Dictionary:
	var f: Dictionary = FOES.get(kind, FOES.caravel).duplicate()
	f.kind = kind
	if foe_name != "":
		f.name = foe_name
	f.guns = f.guns + 0.1 * armed
	f.men = f.men + 0.4 * armed
	f.morale = minf(90, f.morale + 8 * armed)
	f.rigging = 100.0
	return f

static func _fire(s: Dictionary) -> float:
	return 0.35 + 3 * float(s.guns)

static func _melee(s: Dictionary) -> float:
	return maxf(0.05, s.men) * (0.4 + s.morale / 100.0)

static func speed(s: Dictionary) -> float:
	return s.knots * (0.35 + 0.65 * s.rigging / 100.0) * (1.0 if s.get("rows", false) else 0.6 + 0.4 * s.hull / 100.0)

static func _reach(s: Dictionary, r: int) -> float:
	if r <= ALONGSIDE:
		return 1.3
	if r == CLOSE:
		return 1.0
	return 0.6 if s.guns >= 0.25 else 0.3

static func _rnd(rand: Callable, a: float, b: float) -> float:
	return a + rand.call() * (b - a)

# A new fight. role: "attack" (you are the hunter) or "defend". opts: range, tribute, surprise.
static func start(you: Dictionary, role: String, foe: Dictionary, rand: Callable, opts := {}) -> Dictionary:
	var F := {
		"role": role, "you": you, "foe": foe, "r": int(opts.get("range", FAR)), "round": 1, "log": [], "done": null,
		"tribute": int(opts.get("tribute", 0)), "startHull": float(you.hull), "lastYou": "", "lastFoe": "",
	}
	if opts.get("surprise", false):
		foe.morale -= 18  # caught unready
	_plan(F, rand)
	return F

# What you can do now: [{id, name, note, odds?}].
static func choices(F: Dictionary) -> Array:
	var out := []
	for id in ACTIONS:
		var a: Dictionary = ACTIONS[id]
		if a.side != F.role or not a.at.has(F.r):
			continue
		if id == "pay" and not (F.foe.get("tribute", false) and F.tribute > 0 and F.round == 1):
			continue
		var c := {"id": id, "name": "Pay tribute (%d cz)" % F.tribute if id == "pay" else a.name, "note": a.note}
		if id == "board":
			c.odds = board_odds(F.you, F.foe, F.get("plan", "") == "repel", float(F.foe.get("nets", 0.0)))
		if id == "demand":
			c.odds = _demand_odds(F)
		if id == "run":
			c.odds = run_odds(F)
		out.append(c)
	return out

static func board_odds(att: Dictionary, def: Dictionary, repelling: bool, nets := 0.0) -> float:
	var a := _melee(att)
	var d := _melee(def) * (2.0 if repelling else 1.0) * (1 + nets * 1.5)
	return clampf(a * a / (a * a + d * d), 0.03, 0.97)

static func _demand_odds(F: Dictionary) -> float:
	var ratio := (_fire(F.you) + _melee(F.you)) / (_fire(F.foe) + _melee(F.foe))
	var beaten: float = (100 - F.foe.hull) / 100.0
	return clampf(0.05 + (55 - F.foe.morale) / 70.0 + (ratio - 1) * 0.25 + beaten * 0.3 + float(F.you.get("fear", 0.0)), 0.02, 0.95)

static func run_odds(F: Dictionary) -> float:
	var gain := (speed(F.you) - speed(F.foe)) / 1.2
	return clampf(0.5 + gain * 0.6, 0.05, 0.95)

# What the other ship means to do this round (chosen before you choose), and what you see.
static func _plan(F: Dictionary, rand: Callable) -> void:
	var f: Dictionary = F.foe
	var y: Dictionary = F.you
	var p := ""
	if F.role == "attack":  # she is the prey
		var faster := speed(f) >= speed(y) * 0.95
		if f.morale < 22 and rand.call() < 0.6:
			p = "strike"
		elif f.get("rows", false):
			p = "repel" if rand.call() < 0.5 else "turn"  # corsairs stand and fight
		elif F.r >= CLOSE and (faster or rand.call() < 0.45) and f.rigging > 25:
			p = "run"
		elif f.guns >= 0.1 and rand.call() < 0.55:
			p = "turn"
		else:
			p = "repel" if F.r <= CLOSE and rand.call() < 0.7 else "run"
	else:  # she is the hunter
		if f.morale < 28 and rand.call() < 0.7:
			p = "flee"
		elif F.r >= FAR:
			p = "fire" if f.guns >= 0.25 and rand.call() < 0.4 else "close"
		elif f.get("rows", false):
			p = "board" if rand.call() < 0.7 else "fire"  # galleys board
		else:
			p = "board" if (y.morale < 40 or y.hull < 45 or rand.call() < 0.35) else "fire"
	F.plan = p
	# what the lookout sees: mostly the truth
	if rand.call() < 0.85:
		F.intent = p
	elif F.role == "attack":
		F.intent = "turn" if p == "run" else "run"
	else:
		F.intent = "fire" if p == "board" else "board"
	F.intentText = INTENT[F.intent]

static func _end(F: Dictionary, lines: Array, result: String, text: String) -> void:
	F.done = {"result": result, "text": text}
	lines.append(text)

# One round: you take action `act`; she does what she planned. Returns the lines of what happened.
static func round_(F: Dictionary, act: String, rand: Callable) -> Array:
	if F.done != null:
		return []
	var y: Dictionary = F.you
	var f: Dictionary = F.foe
	var lines: Array = []
	var foe_act: String = F.plan
	F.shots = []
	F.lastYou = act
	F.lastFoe = foe_act
	var you_attack: bool = F.role == "attack"

	# Giving up
	if act == "strike":
		_end(F, lines, "struck", "You strike your colours.")
		return _finish(F, lines)
	if act == "pay":
		_end(F, lines, "paid", "You pay the corsairs %d cz to go in peace." % F.tribute)
		return _finish(F, lines)
	if foe_act == "strike":
		_end(F, lines, "taken", "The %s strikes her colours." % f.name)
		return _finish(F, lines)
	if foe_act == "flee" and act != "run":
		_end(F, lines, "sheered", "The %s sheers off and makes away: you have beaten them off." % f.name)
		return _finish(F, lines)
	if act == "demand":
		if rand.call() < _demand_odds(F):
			_end(F, lines, "taken", "You call on her to strike, and she does: the %s is yours without another shot." % f.name)
			return _finish(F, lines)
		lines.append("You call on her to strike. Her captain answers with a curse.")
		f.morale = minf(100, f.morale + 4)

	# Way: who closes, who gets away
	var att: Dictionary = y if you_attack else f
	var def: Dictionary = f if you_attack else y
	var a_act: String = act if you_attack else foe_act
	var d_act: String = foe_act if you_attack else act
	var closing := a_act == "close" or a_act == "board"
	var before: int = F.r
	if d_act == "run" or foe_act == "flee":
		var gain := (speed(def) - speed(att)) / 1.2 + _rnd(rand, -0.45, 0.45)
		if closing:
			if gain > 0.3:
				F.r += 1
			elif gain < -0.15:
				F.r = maxi(ALONGSIDE if a_act == "board" else CLOSE, F.r - 1)
		elif gain > -0.2:
			F.r += 1
	elif closing:
		F.r = maxi(ALONGSIDE if a_act == "board" else CLOSE, F.r - 1)
		if a_act == "board" and before == FAR:
			F.r = CLOSE  # too far to grapple this round
	if F.r != before:
		if F.r > before:
			lines.append(("She draws away: %s." if you_attack else "You draw away: %s.") % RANGE_NAMES[F.r])
		else:
			lines.append("%s: %s." % ["You close" if you_attack else "She closes", RANGE_NAMES[F.r]])
	if F.r >= GONE:
		if you_attack:
			_end(F, lines, "gotaway", "The %s gets clean away." % f.name)
		else:
			_end(F, lines, "escaped", "The %s falls astern: you have escaped." % f.name)
		return _finish(F, lines)

	# Guns
	var your_shot: String = act if act in ["fire", "rigging", "turn"] else ""
	var her_shot: String = foe_act if foe_act in ["fire", "turn", "rigging"] else ""
	if your_shot != "":
		_shoot(F, y, f, your_shot, true, rand, lines)
	if her_shot != "":
		_shoot(F, f, y, her_shot, false, rand, lines)

	# Boarding
	var you_board: bool = act == "board" and F.r == ALONGSIDE
	var she_boards: bool = foe_act == "board" and F.r == ALONGSIDE
	if act == "board" and F.r != ALONGSIDE:
		lines.append("She slips away from your grapnels.")
	if you_board or she_boards:
		var p: float
		if you_board and she_boards:
			p = 0.5 * (pow(_melee(y), 2) / (pow(_melee(y), 2) + pow(_melee(f), 2))) + 0.25
		elif you_board:
			p = board_odds(y, f, foe_act == "repel", 0.0)
		else:
			p = board_odds(f, y, act == "repel", float(y.nets))
		var won: bool = rand.call() < p
		if you_board:
			if won:
				_end(F, lines, "taken", "Your men swarm over her rail%s. The %s is yours." % [" through her pikes" if foe_act == "repel" else "", f.name])
				return _finish(F, lines)
			y.morale -= 22
			y.men *= 0.78
			f.morale = minf(100, f.morale + 8)
			F.r = CLOSE
			lines.append("Your boarders are thrown back%s. You cast off with men lost." % [": she was ready for you" if foe_act == "repel" else ""])
		else:
			if won:
				_end(F, lines, "boarded", "They swarm over your rail%s. The ship is theirs." % [" through your pikes" if act == "repel" else ""])
				return _finish(F, lines)
			f.morale -= 26
			f.men *= 0.75
			y.morale = minf(100, y.morale + 8)
			F.r = CLOSE
			lines.append("%s boarders are thrown back into the sea. She casts off, her men bloodied." % ["You were ready for them: the" if act == "repel" else "The"])
	elif act == "repel":
		y.morale = minf(100, y.morale + 4)
		lines.append("Your men wait at the rail, but no boarders come.")
	elif foe_act == "repel" and act != "board":
		f.morale = minf(100, f.morale + 3)

	# Broken?
	f.hull = maxf(0, f.hull)
	y.hull = maxf(0, y.hull)
	if f.morale <= 12 or f.hull <= 15:
		if you_attack:
			_end(F, lines, "taken", ("The %s is shot to pieces and strikes her colours." if f.hull <= 15 else "Her crew throw down their arms: the %s strikes her colours.") % f.name)
		else:
			_end(F, lines, "beaten", "The galley's rowers are beaten: she lies alongside, yours for the taking." if f.get("rows", false) else "The %s has had enough and sheers off." % f.name)
		return _finish(F, lines)
	if y.morale <= 10 or y.hull <= 12:
		_end(F, lines, "repulsed" if you_attack else "struck", "Your ship is shot to pieces: your crew strike the colours." if y.hull <= 12 else "Your crew will fight no more: they strike the colours.")
		return _finish(F, lines)

	# Dusk
	F.round += 1
	if F.round > ROUNDS:
		if you_attack:
			_end(F, lines, "gotaway", "Night falls, and the %s slips away in the dark." % f.name)
		else:
			_end(F, lines, "escaped", "Night falls, and the %s loses you in the dark." % f.name)
		return _finish(F, lines)
	_plan(F, rand)
	return _finish(F, lines)

static func _shoot(F: Dictionary, from: Dictionary, to: Dictionary, kind: String, by_you: bool, rand: Callable, lines: Array) -> void:
	var k := _reach(from, F.r) * _rnd(rand, 0.7, 1.3) * _fire(from)
	if kind == "rigging":
		var cut := minf(to.rigging, 42 * _reach(from, F.r) * _rnd(rand, 0.7, 1.3) * maxf(0.7, _fire(from)))
		to.rigging -= cut
		to.hull -= 3 * k
		to.morale -= 4 * k
		var whose := "her" if by_you else "your"
		lines.append("%s %s rigging: %s." % ["You rake" if by_you else "She rakes", whose, ("%s sails hang in rags" % whose) if to.rigging < 30 else "spars and canvas come down"])
	else:
		var dmg := 13 * k * (1.25 if kind == "turn" else 1.0)
		to.hull -= dmg
		to.morale -= dmg * 0.7
		to.men *= 1 - dmg / 300.0
		var how := "a telling broadside" if dmg >= 14 else "some hits" if dmg >= 6 else "most of it wide"
		lines.append("%s into %s%s: %s." % ["You fire" if by_you else "She fires", "her" if by_you else "you", " at long range" if F.r >= FAR else "", how])
	if not F.has("shots"):
		F.shots = []
	F.shots.append({"by_you": by_you, "kind": kind, "hit": k})  # for the sea view's smoke and splashes

static func _finish(F: Dictionary, lines: Array) -> Array:
	F.log.append_array(lines)
	return lines

# Who won, for the callers: "win", "clear", "lose", "paid", or "none".
static func outcome(F: Dictionary) -> String:
	if F.done == null:
		return ""
	var r: String = F.done.result
	if r == "taken" or r == "beaten":
		return "win"
	if r == "escaped" or r == "sheered":
		return "clear"
	if r == "struck" or r == "boarded":
		return "lose"
	if r == "paid":
		return "paid"
	return "none"

static func damage_to(F: Dictionary) -> float:
	return maxf(0.0, F.startHull - F.you.hull)

# Play a whole fight with a simple policy (the sailing master's choice).
static func autoplay(F: Dictionary, rand: Callable) -> Dictionary:
	var guard := 0
	while F.done == null and guard < 10:
		guard += 1
		var cs := choices(F)
		var ids := cs.map(func(c): return c.id)
		var act := ""
		if F.role == "attack":
			var b = cs.filter(func(c): return c.id == "board")
			var d = cs.filter(func(c): return c.id == "demand")
			if not d.is_empty() and d[0].odds > 0.55:
				act = "demand"
			elif F.intent == "run" and ids.has("rigging") and F.foe.rigging > 35 and speed(F.foe) > speed(F.you) * 0.9:
				act = "rigging"
			elif not b.is_empty() and b[0].odds > 0.45 and F.intent != "repel":
				act = "board"
			elif F.r == FAR:
				act = "close"
			else:
				act = "fire"
		else:
			if F.intent == "board" and F.r <= CLOSE and run_odds(F) < 0.45:
				act = "repel"
			elif run_odds(F) > 0.4:
				act = "run"
			else:
				act = "turn"
		round_(F, act, rand)
	return F
