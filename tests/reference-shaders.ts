export const vertex = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const fragment = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uVolume;
uniform vec3 uSize;
uniform vec3 uCounts;
uniform vec3 uCuts;
uniform float uOpacity;
uniform float uSteps;
uniform mat4 uViewProjection;
in vec3 vWorld;
out vec4 outColor;

vec3 linearize(vec3 c) { return mix(c/12.92, pow((c+.055)/1.055,vec3(2.4)), step(vec3(.04045),c)); }
vec3 encode(vec3 c) { return mix(12.92*c,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c)); }
vec4 sampleAt(vec3 p) {
  // Face coordinates map exactly to the retained sample's centre.
  vec3 minimumIndex = vec3(0.0,0.0,floor((1.0-uCuts.z)*uCounts.z+.5));
  vec3 maximumIndex = max(vec3(0.0), floor(vec3(uCuts.xy,1.0)*uCounts+.5)-1.0);
  vec3 index = clamp(vec3(p.xy,1.0-p.z)*uCounts-.5, minimumIndex, maximumIndex);
  return texture(uVolume,(index+.5)/uCounts);
}
float depthAt(vec3 p) {
  vec4 clip=uViewProjection*vec4((p-.5)*uSize,1.0);
  return clip.z/clip.w*.5+.5;
}
void main() {
  vec3 origin = cameraPosition/uSize + .5;
  vec3 direction = normalize(vWorld-cameraPosition)/uSize;
  vec3 safeDirection = mix(vec3(1e-7),direction,greaterThan(abs(direction),vec3(1e-7)));
  vec3 a = (vec3(0.0)-origin)/safeDirection;
  vec3 b = (uCuts-origin)/safeDirection;
  vec3 entry = min(a,b), leave = max(a,b);
  float nearDistance = max(max(entry.x,entry.y),entry.z);
  float farDistance = min(min(leave.x,leave.y),leave.z);
  nearDistance = max(nearDistance,0.0);
  if (farDistance <= nearDistance) discard;
  vec3 front = origin+direction*(nearDistance+1e-5);
  if (uOpacity >= .9999) { outColor=vec4(sampleAt(front).rgb,1.0); gl_FragDepth=depthAt(front); return; }
  float rayLength = farDistance-nearDistance;
  float stepLength = rayLength/uSteps;
  float voxelRate = length(direction*uCounts);
  float backgroundDensity = -log(max(1.0-uOpacity,.00001));
  // A continuous entry surface prevents a visual pop at the opaque endpoint.
  // Foreground on the cut face remains opaque even with background at zero.
  vec4 surface=sampleAt(front);
  float surfaceConfidence=smoothstep(.15,.65,surface.a);
  float surfaceAlpha=mix(uOpacity,1.0,surfaceConfidence);
  vec4 accumulated=vec4(linearize(surface.rgb)*surfaceAlpha,surfaceAlpha);
  float visibleDepth=surfaceAlpha>.02 ? depthAt(front) : 1.0;
  // Integrate in front-to-back order, independent of camera orientation.
  for (int i=0; i<768; i++) {
    if (float(i)>=uSteps || accumulated.a>.9999) break;
    float distance = nearDistance+(float(i)+.5)*stepLength;
    vec4 value = sampleAt(origin+direction*distance);
    // Semantic masks have solid interiors and interpolated coverage only at boundaries.
    float confidence = smoothstep(.15,.65,value.a);
    float movingDensity = -log(max(1.0-confidence,.00001))*voxelRate;
    float alpha = confidence>=.9999 ? 1.0 : 1.0-exp(-(movingDensity+backgroundDensity)*stepLength);
    accumulated.rgb += (1.0-accumulated.a)*alpha*linearize(value.rgb);
    accumulated.a += (1.0-accumulated.a)*alpha;
    if(visibleDepth==1.0 && accumulated.a>.02) visibleDepth=depthAt(origin+direction*distance);
  }
  // Black stage: precomposite here so gamma-correct blending is deterministic.
  outColor=vec4(encode(accumulated.rgb),1.0);
  gl_FragDepth=visibleDepth;
}`;
