import { DAY, type CityLight } from "@/map/daylight";

/** Every street material, including streamed cells, reads the same uniform objects. */
export class StreetLighting {
  readonly uniforms = {
    gradeOn: { value: false },
    cityCurve: { value: new Float32Array(DAY.curve) },
    lamps: { value: 0 },
  };

  set(light: CityLight): void {
    this.uniforms.gradeOn.value = light !== DAY;
    this.uniforms.cityCurve.value.set(light.curve);
    this.uniforms.lamps.value = light.lamps;
  }
}

/** The same five RGB samples as the map's component-transfer tables, in display space. */
export const CITY_GRADE = /* glsl */ `
uniform bool gradeOn;
uniform vec3 cityCurve[5];
uniform float lamps;
vec3 graded(vec3 c) {
  if (!gradeOn) return c;
  vec3 x = clamp(c, 0.0, 1.0) * 4.0;
  ivec3 i = min(ivec3(x), ivec3(3));
  vec3 low = vec3(cityCurve[i.r].r, cityCurve[i.g].g, cityCurve[i.b].b);
  vec3 high = vec3(cityCurve[i.r + 1].r, cityCurve[i.g + 1].g, cityCurve[i.b + 1].b);
  return mix(low, high, x - vec3(i));
}
`;
