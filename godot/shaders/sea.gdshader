// The open sea: a few travelling waves that move the surface and its normals, deep water
// shading and a little foam on the crests. Kept simple for phones and the web build.
shader_type spatial;
render_mode cull_disabled;

uniform vec4 deep : source_color = vec4(0.03, 0.16, 0.24, 1.0);
uniform vec4 shallow : source_color = vec4(0.10, 0.36, 0.42, 1.0);
uniform vec4 foam : source_color = vec4(0.86, 0.90, 0.88, 1.0);
uniform float height = 0.6;

const int N = 4;
const vec2 DIR[4] = vec2[](vec2(1.0, 0.2), vec2(0.6, 1.0), vec2(-0.4, 0.9), vec2(0.9, -0.5));
const float LEN[4] = float[](22.0, 13.0, 7.0, 4.0);
const float AMP[4] = float[](1.0, 0.55, 0.28, 0.12);

float wave(vec2 p, float t, out vec2 grad) {
	float h = 0.0;
	grad = vec2(0.0);
	for (int i = 0; i < N; i++) {
		vec2 d = normalize(DIR[i]);
		float k = 6.2831 / LEN[i];
		float c = sqrt(9.8 / k);
		float f = k * (dot(d, p) - c * t);
		h += AMP[i] * sin(f);
		grad += AMP[i] * k * cos(f) * d;
	}
	return h * height;
}

varying float crest;
void vertex() {
	vec2 g;
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float h = wave(w.xz, TIME * 0.6, g);
	VERTEX.y += h;
	NORMAL = normalize(vec3(-g.x * height, 1.0, -g.y * height));
	crest = h;
}
void fragment() {
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	vec3 col = mix(deep.rgb, shallow.rgb, clamp(crest * 0.6 + 0.4, 0.0, 1.0));
	col = mix(col, foam.rgb, smoothstep(0.75, 1.1, crest) * 0.7);
	ALBEDO = col;
	ROUGHNESS = 0.08;
	METALLIC = 0.0;
	SPECULAR = 0.6 + fres * 0.4;
}
