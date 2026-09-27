import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PALETTE, SUN_DIR } from './palette'

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p;
}
`

const frag = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uGround;
uniform float uTime;
uniform float uEnv;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = smoothstep(-0.02, 0.5, h);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.7));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.16 + pow(sd, 48.0) * 0.3 + pow(sd, 1200.0) * 4.0);
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.16);
    float c = fbm(uv * 0.9 + vec2(uTime * 0.003, uTime * 0.001));
    float c2 = fbm(uv * 2.4 - vec2(uTime * 0.005, 0.0));
    float cloud = smoothstep(0.5, 0.78, c * 0.78 + c2 * 0.32);
    cloud *= smoothstep(0.0, 0.1, h);
    // flatter, lighter clouds near the horizon
    vec3 cc = mix(vec3(1.0, 0.99, 0.97), uHorizon, 0.2 + 0.3 * (1.0 - t));
    cc += uSunColor * pow(sd, 3.0) * 0.25;
    float shade = 0.82 + 0.18 * smoothstep(0.3, 0.9, c2);
    col = mix(col, cc * shade, cloud * 0.85);
  } else {
    col = mix(uHorizon, uGround, uEnv * smoothstep(0.0, -0.25, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function makeSkyMaterial(env = false) {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(PALETTE.zenith) },
      uHorizon: { value: new THREE.Color(PALETTE.horizon) },
      uSunColor: { value: new THREE.Color(PALETTE.sun) },
      uSunDir: { value: SUN_DIR.clone() },
      uGround: { value: new THREE.Color('#5d7263') },
      uTime: { value: 0 },
      uEnv: { value: env ? 1 : 0 },
    },
  })
}

export function Sky() {
  const sky = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), makeSkyMaterial(false))
    m.frustumCulled = false
    m.renderOrder = -10
    m.userData.treatAsOpaque = true
    return m
  }, [])
  useFrame(({ camera, clock }) => {
    ;(sky.material as THREE.ShaderMaterial).uniforms.uTime.value = clock.elapsedTime
    sky.position.copy(camera.position)
  })
  return <primitive object={sky} />
}
