import * as THREE from "three";
import { precipitates, type WeatherCondition } from "@/map/weather";
import { CITY_GRADE, type StreetLighting } from "./city-light";
import { NOT_MIRRORED } from "./materials";

/** A repeating volume of world-space drops around the eye. Camera movement gives them
 * parallax, and the normal depth buffer lets buildings and decks hide them. */
export function makePrecipitation(lighting: StreetLighting, grey: THREE.IUniform<number>) {
  const seeds = new Float32Array(1600 * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(seeds, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...lighting.uniforms,
      grey,
      time: { value: 0 },
      height: { value: 1 },
      snow: { value: false },
      storm: { value: false },
    },
    vertexShader: `
      uniform float time, height;
      uniform bool snow, storm;
      varying float alpha, streakWidth;
      void main() {
        vec3 box = vec3(30., 18., 30.);
        float speed = (snow ? 1.25 : (storm ? 15. : 10.)) * (0.7 + position.x * 0.3);
        vec3 drift = vec3((storm ? 0.35 : 0.14) * speed, -speed, 0.) * time;
        if (snow) drift.x += 0.55 * sin(time + position.z * 42.);
        vec3 offset = mod(position * box + drift - cameraPosition + box * 0.5, box) - box * 0.5;
        vec3 world = cameraPosition + offset;
        vec4 mv = viewMatrix * vec4(world, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(height * (snow ? 0.043 : 0.12) / max(0.5, -mv.z), snow ? 1. : 2., snow ? 4. : 12.);
        streakWidth = max(0.11, 0.6 / gl_PointSize);
        alpha = (1. - smoothstep(10., 15., length(offset))) * step(0.06, world.y);
      }`,
    fragmentShader: `
      uniform bool snow;
      uniform float grey;
      varying float alpha, streakWidth;
      ${CITY_GRADE}
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        if (!snow && abs(p.x - 0.20 * p.y) > streakWidth) discard;
        vec3 c = snow ? vec3(0.96, 0.98, 1.) : vec3(0.76, 0.85, 0.92);
        gl_FragColor = vec4(graded(c), alpha * (snow ? 0.9 : 0.65) * (1. - grey));
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.layers.set(NOT_MIRRORED);
  points.frustumCulled = false;
  points.visible = false;
  return {
    points,
    set(condition: WeatherCondition, reduced: boolean) {
      points.visible = precipitates(condition) && !reduced;
      material.uniforms.snow.value = condition === "snow";
      material.uniforms.storm.value = condition === "storm";
      geometry.setDrawRange(0, condition === "storm" ? 1600 : 1000);
    },
    frame(time: number, height: number) {
      material.uniforms.time.value = time;
      material.uniforms.height.value = height;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
