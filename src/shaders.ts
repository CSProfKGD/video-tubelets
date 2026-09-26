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
uniform sampler3D uInstances;
uniform float uInstanceColors;
uniform float uInstanceLighting;
uniform sampler2D uTimes;
uniform float uActiveTime;
uniform float uEmphasis;
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
  float activeIndex=(1.0-uCuts.z)*uCounts.z;
  vec3 minimumIndex = vec3(0.0,0.0,activeIndex);
  vec3 maximumIndex = max(vec3(0.0), floor(vec3(uCuts.xy,1.0)*uCounts+.5)-1.0);
  vec3 index = clamp(vec3(p.xy,1.0-p.z)*uCounts-.5, minimumIndex, maximumIndex);
  vec3 uv=(index+.5)/uCounts;
  vec4 voxel=texture(uVolume,uv);
  if(uInstanceColors>0.5 && voxel.a>0.0) {
    // Coverage-weighted identity preserves color at antialiased edges and
    // blends continuously when adjacent time samples contain different people.
    float identity=texture(uInstances,uv).r/max(voxel.a,1.0/255.0);
    float person=clamp((identity*255.0-128.0)/127.0,0.0,1.0);
    vec3 color=mix(vec3(99.0,230.0,222.0),vec3(255.0,159.0,122.0),person)/255.0;
    voxel.rgb=color;
  }
  return voxel;
}
// Shading affects color only. The masks, coverage and temporal sampling stay intact.
vec3 instanceLight(vec4 value, vec3 p, vec3 viewDirection) {
  vec3 base=linearize(value.rgb);
  if(uInstanceColors<.5 || uInstanceLighting<.5 || value.a<.001) return base;
  vec3 uv=clamp(vec3(p.xy,1.0-p.z),.5/uCounts,1.0-.5/uCounts);
  // A broad spatial footprint suppresses tiny segmentation ridges in the normals.
  vec3 h=vec3(3.0)/uCounts;
  float dx=texture(uVolume,uv+vec3(h.x,0,0)).a-texture(uVolume,uv-vec3(h.x,0,0)).a;
  float dy=texture(uVolume,uv+vec3(0,h.y,0)).a-texture(uVolume,uv-vec3(0,h.y,0)).a;
  float dz=texture(uVolume,uv+vec3(0,0,h.z)).a-texture(uVolume,uv-vec3(0,0,h.z)).a;
  vec3 gradient=-vec3(dx,dy,-dz)/(2.0*h*uSize);
  vec3 view=normalize(viewDirection);
  vec3 normal=length(gradient)>.001 ? normalize(gradient) : view;
  vec3 key=normalize(vec3(-.45,.8,.7));
  vec3 fill=normalize(vec3(.75,.15,-.45));
  float diffuse=.52+.48*max(dot(normal,key),0.0)+.16*max(dot(normal,fill),0.0);
  vec3 halfVector=normalize(key+view);
  float specular=.16*pow(max(dot(normal,halfVector),0.0),18.0);
  float rim=.055*pow(1.0-max(dot(normal,view),0.0),3.0);
  vec3 satin=base*diffuse+vec3(specular)+base*rim;
  // The active cut stays flat, with a soft join into the lit outer volume.
  float cap=smoothstep(0.0,2.0/uCounts.z,abs(p.z-uCuts.z));
  return mix(base,satin,cap);
}
float timeAt(vec3 p) {
  float index=clamp((1.0-p.z)*uCounts.z,0.0,uCounts.z-1.0);
  int lo=int(floor(index)), hi=min(lo+1,int(uCounts.z)-1);
  return mix(texelFetch(uTimes,ivec2(lo,0),0).r,texelFetch(uTimes,ivec2(hi,0),0).r,fract(index));
}
float falloff(vec3 p) {
  float delta=max(0.0,timeAt(p)-uActiveTime)/2.0;
  return mix(1.0,exp(-delta*delta),uEmphasis);
}
float depthAt(vec3 p) {
  vec4 clip=uViewProjection*vec4((p-.5)*uSize,1.0);
  return clip.z/clip.w*.5+.5;
}
void main() {
  vec3 origin = cameraPosition/uSize + .5;
  vec3 direction = normalize(vWorld-cameraPosition)/uSize;
  vec3 safeDirection = mix(vec3(1e-7),direction,greaterThan(abs(direction),vec3(1e-7)));
  // A single ray/plane intersection: no neighboring-time volume contribution.
  if(uEmphasis>0.5) {
    if(abs(direction.z)<1e-7) discard;
    float distance=(uCuts.z-origin.z)/direction.z;
    vec3 p=origin+direction*distance;
    if(distance<0.0 || any(lessThan(p.xy,vec2(0.0))) || any(greaterThan(p.xy,vec2(1.0)))) discard;
    vec4 value=sampleAt(p);
    float coverage=uInstanceColors>0.5 ? value.a : smoothstep(.15,.65,value.a);
    float alpha=mix(uOpacity,1.0,coverage);
    outColor=vec4(encode(linearize(value.rgb)*alpha),1.0);
    gl_FragDepth=(coverage>.02) ? depthAt(p) : 1.0;
    return;
  }
  vec3 a = (vec3(0.0)-origin)/safeDirection;
  vec3 b = (uCuts-origin)/safeDirection;
  vec3 entry = min(a,b), leave = max(a,b);
  float nearDistance = max(max(entry.x,entry.y),entry.z);
  float farDistance = min(min(leave.x,leave.y),leave.z);
  nearDistance = max(nearDistance,0.0);
  if (farDistance <= nearDistance) discard;
  vec3 front = origin+direction*(nearDistance+1e-5);
  float rayLength = farDistance-nearDistance;
  float voxelRate = length(direction*uCounts);
  // Anchor the lattice at the fixed far face, not the moving cut face.
  // Only the leading partial cell changes when time is scrubbed in either direction.
  float stepLength = .5/voxelRate;
  vec3 fullLeave=max(a,(vec3(1.0)-origin)/safeDirection);
  float fixedFar=min(min(fullLeave.x,fullLeave.y),fullLeave.z);
  float cellStart = fixedFar-ceil((fixedFar-nearDistance)/stepLength)*stepLength;
  float backgroundDensity = -log(max(1.0-uOpacity,.00001));
  // A continuous entry surface prevents a visual pop at the opaque endpoint.
  // Foreground on the cut face remains opaque even with background at zero.
  vec4 surface=sampleAt(front);
  float surfaceConfidence=uInstanceColors>0.5 ? surface.a : smoothstep(.15,.65,surface.a);
  float surfaceAlpha=mix(uOpacity,1.0,surfaceConfidence)*falloff(front);
  vec3 surfaceColor=instanceLight(surface,front,-direction*uSize);
  vec4 accumulated=vec4(surfaceColor*surfaceAlpha,surfaceAlpha);
  // Transparent background contributes color, not an opaque rectangular occluder.
  float visibleDepth=surfaceConfidence>.02 ? depthAt(front) : 1.0;
  // Integrate in front-to-back order, independent of camera orientation.
  for (int i=0; i<4096; i++) {
    if (accumulated.a>.9999 && visibleDepth<1.0) break;
    float cellNear=max(nearDistance,cellStart+float(i)*stepLength);
    float cellFar=min(farDistance,cellStart+(float(i)+1.0)*stepLength);
    if(cellNear>=farDistance) break;
    float sampleLength=max(0.0,cellFar-cellNear);
    float distance=(cellNear+cellFar)*.5;
    vec3 position=origin+direction*distance;
    vec4 value = sampleAt(position);
    // Semantic masks have solid interiors and interpolated coverage only at boundaries.
    float confidence = uInstanceColors>0.5 ? value.a : smoothstep(.15,.65,value.a);
    float movingDensity = -log(max(1.0-confidence,.00001))*voxelRate;
    float alpha=1.0-exp(-(movingDensity+backgroundDensity)*sampleLength);
    accumulated.rgb += (1.0-accumulated.a)*alpha*instanceLight(value,position,-direction*uSize);
    accumulated.a += (1.0-accumulated.a)*alpha;
    if(visibleDepth==1.0 && confidence>.02) visibleDepth=depthAt(position);
  }
  // From the back, the active XY surface can be the ray's exit rather than entry.
  // Sample it explicitly so thin slices and silhouettes remain intact at any orbit.
  vec3 back=origin+direction*farDistance;
  if(uEmphasis>0.0 && abs(back.z-uCuts.z)<.00001 && direction.z>0.0) {
    vec4 activeSlice=sampleAt(back);
    float alpha=mix(uOpacity,1.0,smoothstep(.15,.65,activeSlice.a))*uEmphasis;
    accumulated.rgb+=(1.0-accumulated.a)*alpha*linearize(activeSlice.rgb);
    accumulated.a+=(1.0-accumulated.a)*alpha;
    if(visibleDepth==1.0 && activeSlice.a>.02) visibleDepth=depthAt(back);
  }
  // Black stage: precomposite here so gamma-correct blending is deterministic.
  outColor=vec4(uOpacity>=.9999 ? (uInstanceColors>.5 ? encode(surfaceColor) : surface.rgb) : encode(accumulated.rgb),1.0);
  gl_FragDepth=visibleDepth;
}`;
