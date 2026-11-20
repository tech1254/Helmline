# Game days and dates: day 0 is 1 March 1451 (as in the browser game, config.js START_DATE).
class_name Calendar
extends RefCounted

const START_UNIX := -16372972800  # 1451-03-01T00:00:00Z, seconds
const MONTHS := ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

static func date_of(day: float) -> Dictionary:
	return Time.get_datetime_dict_from_unix_time(START_UNIX + int(floor(day)) * 86400)

static func year_of(day: float) -> int:
	return date_of(day).year

# The game day on which 1 January of `year` falls (may be negative for 1451).
static func day_of_year(year: int) -> int:
	var unix := Time.get_unix_time_from_datetime_dict({"year": year, "month": 1, "day": 1, "hour": 0, "minute": 0, "second": 0})
	return int(ceil(float(unix - START_UNIX) / 86400.0))

# The game day of a date.
static func day_of(year: int, month: int, d: int) -> int:
	var unix := Time.get_unix_time_from_datetime_dict({"year": year, "month": month, "day": d, "hour": 0, "minute": 0, "second": 0})
	return int(round(float(unix - START_UNIX) / 86400.0))

static func fmt_date(day: float) -> String:
	var t := date_of(day)
	return "%d %s %d" % [t.day, MONTHS[t.month - 1], t.year]
