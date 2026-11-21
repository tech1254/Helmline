# The arrival: when the ship drops anchor in a port that has an arrival clip
# (art/clips/<port>_arrival.ogv), it plays full screen; a click or a key skips it.
extends CanvasLayer

@onready var video: VideoStreamPlayer = $Video
@onready var title: Label = $Title

func _ready() -> void:
	visible = false
	Game.docked.connect(play_for)
	video.finished.connect(close)

static func clip_path(port_id: String) -> String:
	return "res://art/clips/%s_arrival.ogv" % port_id

func play_for(port_id: String) -> void:
	var path := clip_path(port_id)
	if not ResourceLoader.exists(path):
		return
	video.stream = load(path)
	title.text = Data.port(port_id).name
	visible = true
	Game.speed_before_clip = Game.speed
	Game.speed = 0
	video.play()

func close() -> void:
	if not visible:
		return
	video.stop()
	visible = false
	Game.speed = Game.speed_before_clip

func _input(e: InputEvent) -> void:
	if visible and ((e is InputEventMouseButton and e.pressed) or (e is InputEventKey and e.pressed)):
		get_viewport().set_input_as_handled()
		close()
