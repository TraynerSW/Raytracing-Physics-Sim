


export const vertexShaderSource = `#version 300 es
in vec4 a_position;
void main() {
  gl_Position = a_position;
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraDir;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;

uniform sampler2D u_sphereDataTexture;
uniform vec2 u_sphereTextureSize;
uniform int u_sphereCount;

uniform int u_lightCount;
uniform vec4 u_lightPositions[30]; 
uniform vec3 u_lightColors[30];
uniform bool u_showLightOrbs;

uniform int u_rayCount; 
uniform bool u_antialiasing; 
uniform int u_groundTexture; 
uniform int u_maxBounces;
uniform float u_maxDist; 
uniform bool u_rain;
uniform bool u_fog;
uniform float u_fogDensity;
uniform float u_fogDistance;
uniform bool u_shadows;
uniform bool u_ao;
uniform float u_reflectionIntensity;

uniform bool u_primaryLightEnabled;
uniform vec3 u_lightPos; 
uniform float u_lightIntensity;

uniform bool u_sunFocusEnabled;
uniform bool u_dayNightCycle;
uniform float u_timeOfDay;
uniform vec3 u_focusPos; 

uniform int u_skyboxType; 

uniform bool u_water;
uniform float u_waterLevel;

uniform bool u_indirectLighting;
uniform bool u_globalIllumination;
uniform float u_roughness;
uniform int u_ballTexture; 

uniform bool u_laserActive;
uniform vec3 u_laserOrigin;
uniform vec3 u_laserDir;

out vec4 outColor;

#define EPSILON 0.001
#define PI 3.14159265359

struct SphereData {
    vec3 center;
    float radius;
    vec3 color;
    float reflectivity;
};

SphereData getSphere(int i) {
    int width = int(u_sphereTextureSize.x);
    int x = i % width;
    int y = (i / width) * 2;
    vec4 d1 = texelFetch(u_sphereDataTexture, ivec2(x, y), 0);
    vec4 d2 = texelFetch(u_sphereDataTexture, ivec2(x, y + 1), 0);
    return SphereData(d1.xyz, d1.w, d2.rgb, d2.w);
}

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float hash(vec3 p) {
    p  = fract( p*0.3183099 + .1 );
    p *= 17.0;
    return fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
}

vec3 cosWeightedRandomHemisphereDirection( const vec3 n, float seed ) {
    vec2 r = vec2(rand(vec2(seed, seed+1.0)), rand(vec2(seed+2.0, seed+3.0)));
    vec3  uu = normalize( cross( n, vec3(0.0,1.0,1.0) ) );
    vec3  vv = cross( uu, n );
    float ra = sqrt(r.y);
    float rx = ra*cos(6.2831*r.x); 
    float ry = ra*sin(6.2831*r.x);
    float rz = sqrt( 1.0-r.y );
    vec3  rr = vec3( rx*uu + ry*vv + rz*n );
    return normalize( rr );
}

float noise( in vec3 x ) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix( hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)),f.x),
                   mix( hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix( hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)),f.x),
                   mix( hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}

float fbm(vec3 x) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100);
    mat3 rot = mat3(cos(0.5), sin(0.5), 0.0, -sin(0.5), cos(0.5), 0.0, 0.0, 0.0, 1.0);
    for (int i = 0; i < 5; ++i) {
        v += a * noise(x);
        x = rot * x * 2.0 + shift;
        a *= 0.5;
    }
    return v;
}

float getRainFactor(vec3 ro, vec3 rd, float t) {
    if (!u_rain) return 0.0;
    float rain = 0.0;
    float time = u_time * 25.0; // Fast fall speed
    
    // Use 5 layers spread out to cover more distance
    for(int i=0; i<5; i++) {
        // Distances approx: 4, 9, 16, 25, 36...
        float dist = 4.0 + float(i) * 5.0 + float(i*i)*1.5;
        if (dist > t) break;
        
        vec3 p = ro + rd * dist;
        p.y += time * (1.0 + float(i)*0.05); // Fall straight down, distant layers slightly faster/different
        p.x += time * 0.2; // Constant wind, no sine wave oscillation
        
        // Thinner (50.0 X/Z scale) and moderate streak length (1.5 Y scale)
        vec3 gridScale = vec3(50.0, 1.5, 50.0); 
        
        vec3 cell = floor(p * gridScale);
        float h = hash(cell);
        
        if (h > 0.99) {
            vec3 local = fract(p * gridScale);
            // Center the streak to make it thin
            if (local.x > 0.4 && local.x < 0.6 && local.z > 0.4 && local.z < 0.6) {
                // Fade out distant layers
                rain += (0.8 / (1.0 + float(i)*0.8));
            }
        }
    }
    return clamp(rain, 0.0, 1.0);
}

vec2 hex(vec2 p) {
    p.x *= 0.57735*2.0;
    p.y += mod(floor(p.x), 2.0)*0.5;
    p = abs((mod(p, 1.0) - 0.5));
    return abs(max(p.x*1.5 + p.y, p.y*2.0) - 1.0) * vec2(1.0);
}

vec3 getFloorTexture(vec3 p) {
    if (u_groundTexture == 0) {
        float size = 1.0;
        float f = mod(floor(p.x / size) + floor(p.z / size), 2.0);
        return (f < 1.0) ? vec3(0.2) : vec3(0.8);
    }
    if (u_groundTexture == 1) {
        float n = fbm(p * 10.0);
        float grain = noise(p * 50.0);
        return vec3(0.15) + vec3(0.05) * n + vec3(grain * 0.05);
    }
    if (u_groundTexture == 2) {
        vec2 h = hex(p.xz * 2.0);
        float border = smoothstep(0.0, 0.05, h.x);
        float glow = noise(p * 0.5 + u_time * 0.1);
        return mix(vec3(0.0, 0.8, 1.0) * 0.5, mix(vec3(0.1), vec3(0.2), glow), border);
    }
    if (u_groundTexture == 3) {
        float n = fbm(p * 5.0);
        return mix(vec3(0.05, 0.25, 0.05), vec3(0.15, 0.45, 0.1), n);
    }
    return vec3(0.5);
}

vec3 getBallTexture(vec3 p, vec3 col, out float reflectivityModifier, out float roughnessModifier) {
    reflectivityModifier = 1.0;
    roughnessModifier = 1.0;
    
    if (u_ballTexture == 0) return col; 
    
    if (u_ballTexture == 1) { 
        reflectivityModifier = 1.5; 
        roughnessModifier = 0.8; 
        return mix(col, vec3(0.7), 0.5);
    }
    
    if (u_ballTexture == 2) { 
        reflectivityModifier = 1.8;
        roughnessModifier = 0.1; 
        return col * 0.4; 
    }
    
    return col;
}

float mapClouds(vec3 p) {
    float speed = u_rain ? 0.5 : 1.0;
    vec3 q = p - vec3(0.0, 0.0, u_time * speed);
    float f = fbm(q * 0.15);
    return smoothstep(0.4, 0.8, f);
}

float getStars(vec3 rd) {
    vec3 p = rd * 200.0;
    float h = hash(floor(p));
    vec3 f = fract(p);
    if (h > 0.992) {
        float size = 0.3 + 0.7 * rand(floor(p).xy); 
        float d = length(f - 0.5);
        float brightness = 1.0 - smoothstep(0.0, size * 0.5, d);
        brightness *= (0.5 + 0.5 * sin(u_time * 3.0 + h * 100.0));
        return brightness;
    }
    return 0.0;
}

vec3 getSky(vec3 rd) {
    if (u_skyboxType == 2) {
        return vec3(0.5); 
    }
    if (u_skyboxType == 0) return vec3(0.05); 
    
    vec3 skyCol = vec3(0.2, 0.5, 1.0);
    float starIntensity = 0.0;

    if (!u_primaryLightEnabled) {
        if (u_rain) return mix(vec3(0.15, 0.2, 0.25), vec3(0.2, 0.25, 0.35), max(rd.y, 0.0));
        return vec3(0.05);
    }
    
    if (u_rain) {
        skyCol = mix(skyCol, mix(vec3(0.15, 0.15, 0.2), vec3(0.1, 0.12, 0.15), max(rd.y, 0.0)), 0.8);
    } else if (u_sunFocusEnabled) {
         float ang = u_timeOfDay;
         vec3 sunDir = normalize(vec3(sin(ang), cos(ang), 0.0));
         float sunHeight = sunDir.y;
         float darkness = smoothstep(0.1, -0.2, sunHeight);
         skyCol = mix(skyCol, vec3(0.02, 0.02, 0.05), darkness);
         starIntensity = smoothstep(0.0, 1.0, darkness);
         float sunDot = dot(rd, sunDir);
         if (sunDot > 0.999) {
             skyCol = vec3(1.0, 0.98, 0.95) * 10.0 * u_lightIntensity; 
         } else if (sunDot > 0.99) {
             skyCol = mix(skyCol, vec3(1.0) * u_lightIntensity, (sunDot - 0.99) * 100.0);
         }
         vec3 moonDir = -sunDir;
         float moonDot = dot(rd, moonDir);
         if (moonDot > 0.9995) {
             float craters = fbm(cross(rd, moonDir) * 50.0 + 10.0); 
             vec3 moonColor = vec3(0.6, 0.7, 1.0) * (0.5 + 0.5 * craters); 
             skyCol = moonColor * u_lightIntensity * 4.0; 
         } else if (moonDot > 0.998) {
             skyCol += vec3(0.1, 0.15, 0.3) * (moonDot - 0.998) * 50.0 * u_lightIntensity;
         }
    }

    if (starIntensity > 0.0) {
        float stars = getStars(rd);
        skyCol += vec3(stars) * starIntensity;
    }

    if (rd.y > 0.1) {
        float tStart = 40.0 / rd.y;
        vec3 rayStep = rd * 2.0 / rd.y;
        vec3 p = rd * tStart;
        float density = 0.0;
        for(int i=0; i<5; i++) {
            density += mapClouds(p);
            p += rayStep;
        }
        density = clamp(density * 0.4, 0.0, 1.0);
        vec3 cCol = vec3(1.0);
        if (u_rain) cCol = vec3(0.2);
        if (u_sunFocusEnabled) {
             float ang = u_timeOfDay;
             float sunHeight = cos(ang); 
             float nightFade = smoothstep(-0.1, 0.2, sunHeight);
             cCol *= (0.2 + 0.8 * nightFade); 
        }
        skyCol = mix(skyCol, cCol, density * smoothstep(0.1, 0.3, rd.y));
    }
    return skyCol;
}

struct Hit {
    float dist;
    vec3 point;
    vec3 normal;
    int matIndex; 
    bool inside;
};

float intersectSphere(vec3 ro, vec3 rd, vec4 sphere) {
    vec3 oc = ro - sphere.xyz;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - sphere.w * sphere.w;
    float h = b * b - c;
    if (h < 0.0) return -1.0;
    float t = -b - sqrt(h);
    return (t < 0.0) ? -b + sqrt(h) : t;
}

float intersectPlane(vec3 ro, vec3 rd, float height) {
    float t = -(ro.y - height) / rd.y;
    return (t > 0.0) ? t : -1.0;
}

float intersectCylinder(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra) {
    vec3 ba = pb - pa;
    vec3 oc = ro - pa;
    float baba = dot(ba,ba);
    float bard = dot(ba,rd);
    float baoc = dot(ba,oc);
    float k2 = baba - bard*bard;
    float k1 = baba*dot(oc,rd) - baoc*bard;
    float k0 = baba*dot(oc,oc) - baoc*baoc - ra*ra*baba;
    float h = k1*k1 - k2*k0;
    if( h<0.0 ) return -1.0;
    h = sqrt(h);
    float t = (-k1-h)/k2;
    float y = baoc + t*bard;
    if( y>0.0 && y<baba ) return t;
    return -1.0;
}

vec3 getFloorNormal(vec3 p) {
    if (!u_rain && u_groundTexture != 1) return vec3(0.0, 1.0, 0.0);
    
    if (u_rain) {
        float t = u_time * 10.0;
        float rainNoise = noise(vec3(p.x * 20.0, t, p.z * 20.0));
        float puddles = sin(p.x * 2.0 + t * 0.5) * sin(p.z * 2.0 + t * 0.5) * 0.02;
        float h = (rainNoise * 0.05) + puddles;
        return normalize(vec3(-h * 0.8, 1.0, -h * 0.8));
    }

    if (u_groundTexture == 1) {
        float h = noise(p * 10.0) * 0.05;
        return normalize(vec3(-h, 1.0, -h));
    }
    
    return vec3(0.0, 1.0, 0.0);
}

float intersectBox(vec3 ro, vec3 rd, vec3 boxMin, vec3 boxMax, out vec3 outNormal) {
    vec3 invDir = 1.0 / rd;
    vec3 tMin = (boxMin - ro) * invDir;
    vec3 tMax = (boxMax - ro) * invDir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    if (tNear > tFar || tFar < 0.0) return -1.0;
    
    float t = tNear;
    if (t < 0.0) t = tFar; 

    vec3 p = ro + rd * t;
    vec3 pc = p - (boxMin + boxMax) * 0.5;
    vec3 dist = abs(pc) - (boxMax - boxMin) * 0.5;
    vec3 n = vec3(0.0);
    if (dist.x > dist.y && dist.x > dist.z) n = vec3(sign(pc.x), 0.0, 0.0);
    else if (dist.y > dist.z) n = vec3(0.0, sign(pc.y), 0.0);
    else n = vec3(0.0, 0.0, sign(pc.z));

    outNormal = (tNear < 0.0) ? -n : n;
    return t;
}

bool isInsideBox(vec3 p, vec3 boxMin, vec3 boxMax) {
    return (p.x >= boxMin.x && p.x <= boxMax.x &&
            p.y >= boxMin.y && p.y <= boxMax.y &&
            p.z >= boxMin.z && p.z <= boxMax.z);
}

Hit traceScene(vec3 ro, vec3 rd) {
    Hit closest;
    closest.dist = u_maxDist;
    closest.matIndex = -2;
    closest.inside = false;

    float tFloor = intersectPlane(ro, rd, -1.0);
    if (tFloor > EPSILON && tFloor < closest.dist) {
        closest.dist = tFloor;
        closest.point = ro + rd * tFloor;
        closest.normal = getFloorNormal(closest.point);
        closest.matIndex = -1;
    }
    
    if (u_showLightOrbs) {
        for(int i=0; i<30; i++) {
            if (i >= u_lightCount) break;
            float t = intersectSphere(ro, rd, vec4(u_lightPositions[i].xyz, u_lightPositions[i].w));
            if (t > EPSILON && t < closest.dist) {
                closest.dist = t;
                closest.point = ro + rd * t;
                closest.normal = normalize(closest.point - u_lightPositions[i].xyz);
                closest.matIndex = -10 - i;
            }
        }
    }
    
    if (u_laserActive) {
        float tLaser = intersectCylinder(ro, rd, u_laserOrigin, u_laserOrigin + u_laserDir * 300.0, 0.05);
        if (tLaser > EPSILON && tLaser < closest.dist) {
            closest.dist = tLaser;
            closest.point = ro + rd * tLaser;
            closest.normal = -rd; 
            closest.matIndex = -100; 
        }
    }

    bool skipSpheres = false;
    if (u_water) {
        vec3 boxMin = vec3(-3.5, -1.5, -0.8);
        vec3 boxMax = vec3(3.5, 10.5, 0.8);
        vec3 bn;
        float tB = intersectBox(ro, rd, boxMin, boxMax, bn);
        if (tB < 0.0 && !isInsideBox(ro, boxMin, boxMax)) {
            skipSpheres = true;
        }
    }

    if (!skipSpheres) {
        for (int i = 0; i < 15000; i++) {
            if (i >= u_sphereCount) break;
            SphereData s = getSphere(i);
            float t = intersectSphere(ro, rd, vec4(s.center, s.radius));
            if (t > EPSILON && t < closest.dist) {
                closest.dist = t;
                closest.point = ro + rd * t;
                closest.normal = normalize(closest.point - s.center);
                closest.matIndex = i;
            }
        }
    }
    return closest;
}

void getLighting(vec3 p, vec3 n, vec3 viewDir, float reflectivity, float currentRoughness, float seed, out vec3 diffuseOut, out vec3 specularOut) {
    diffuseOut = vec3(0.0);
    specularOut = vec3(0.0);
    float occlusion = 1.0;
    
    float shininess = mix(128.0, 2.0, currentRoughness);
    
    if (u_ao && !u_water) {
         for(int i=0; i<32; i++) { 
             if (i>=u_sphereCount) break;
             SphereData s = getSphere(i);
             vec3 diff = s.center - p;
             float dist = length(diff);
             bool isSelf = (dot(n, diff/dist) < -0.9) && (dist < s.radius + 0.1);
             
             if (!isSelf && dist < s.radius * 3.0) {
                 float factor = clamp(1.0 - (dist - s.radius)/(s.radius * 2.0), 0.0, 1.0);
                 occlusion -= 0.2 * factor;
             }
         }
         occlusion = clamp(occlusion, 0.0, 1.0);
    }

    if (u_primaryLightEnabled) {
        float ambient = 0.6; 
        if (u_indirectLighting) ambient = 0.05;

        if (u_sunFocusEnabled) {
             float radius = max(u_maxDist * 2.0, 500.0);
             float ang = u_timeOfDay;
             vec3 sunPos = u_focusPos + vec3(sin(ang)*radius, cos(ang)*radius, 0.0);
             vec3 sunColor = vec3(1.0, 0.98, 0.95); 
             float sunIntensity = u_lightIntensity * 3.0; 

             if (sunPos.y < -2.0) {
                sunPos = u_focusPos + vec3(sin(ang + PI)*radius, cos(ang + PI)*radius, 0.0);
                sunColor = vec3(0.25, 0.4, 1.0); 
                sunIntensity = 1.5 * u_lightIntensity; 
             }

             vec3 sunLv = sunPos - p;
             float sunDist = length(sunLv);
             vec3 sunLd = normalize(sunLv);
             
             if (sunPos.y < 0.0) sunIntensity *= 0.0; 

             float sunAtt = 1.0; 
             
             float sunShadow = 1.0;
             if (u_shadows && !u_water) {
                  Hit h = traceScene(p + n * EPSILON * 5.0, sunLd); 
                  if (h.dist < sunDist && h.matIndex >= -1 && h.matIndex != -100) sunShadow = 0.3;
             }
             float sunDiff = max(dot(n, sunLd), 0.0);
             float sunSpec = pow(max(dot(viewDir, reflect(-sunLd, n)), 0.0), shininess);
             
             diffuseOut += sunDiff * sunColor * sunIntensity * sunAtt * sunShadow;
             diffuseOut += sunColor * ambient * sunIntensity; 
             specularOut += sunSpec * sunColor * sunIntensity * sunAtt * sunShadow;

        } else {
            vec3 lightDir = normalize(vec3(0.0, 1.0, 0.0)); 
            vec3 lightColor = vec3(1.0);
            float shadow = 1.0;

            if (u_shadows && !u_water) {
                Hit h = traceScene(p + n * EPSILON * 5.0, lightDir);
                if (h.matIndex != -2 && h.matIndex != -100 && h.dist < 1000.0) shadow = 0.3;
            }

            float diff = max(dot(n, lightDir), 0.0);
            vec3 r = reflect(-lightDir, n);
            float spec = pow(max(dot(viewDir, r), 0.0), (u_rain||reflectivity>0.5)?64.0:16.0);
            if (reflectivity > 0.0 && reflectivity < 1.0) {
                 spec = pow(max(dot(viewDir, r), 0.0), shininess);
            }
            
            diffuseOut += (lightColor*ambient + diff*lightColor*shadow) * u_lightIntensity;
            specularOut += spec * lightColor * shadow * u_lightIntensity;
        }
    }

    for(int i=0; i<30; i++) {
        if (i>=u_lightCount) break;
        vec3 lv = u_lightPositions[i].xyz - p;
        float dist = length(lv);
        vec3 ld = normalize(lv);
        
        float att = 1.0 / (1.0 + 0.05 * dist * dist);
        
        float sh = 1.0;
        if (u_shadows && !u_water) {
            Hit h = traceScene(p + n * EPSILON * 5.0, ld);
            if (h.dist < dist && h.matIndex > -10 && h.matIndex != -100) sh = 0.3;
        }
        
        float diff = max(dot(n, ld), 0.0);
        float spec = pow(max(dot(viewDir, reflect(-ld, n)), 0.0), shininess);
        
        diffuseOut += diff * u_lightColors[i] * att * sh;
        specularOut += spec * u_lightColors[i] * att * sh;
    }
    
    if (u_indirectLighting) {
        vec3 skyAmb = getSky(n);
        vec3 ambientColor = clamp(skyAmb, 0.0, 1.0);
        diffuseOut += ambientColor * 0.2; 
    }
    
    diffuseOut *= occlusion;
    specularOut *= occlusion;
}

vec3 ACESFilm(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}

vec3 castRay(vec3 ro, vec3 rd, vec2 uv) {
    vec3 col = vec3(0.0);
    vec3 throughput = vec3(1.0);
    
    float baseFogDensity = u_fogDensity * 5.0 + (3.0 / u_maxDist); 
    
    vec3 fogColor = vec3(0.5, 0.6, 0.7); 
    if (u_skyboxType == 0) fogColor = vec3(0.02); 
    else if (u_skyboxType == 2) fogColor = vec3(0.5); 
    
    if (u_skyboxType == 1 && !u_primaryLightEnabled) fogColor = vec3(0.02);

    if (u_rain) {
        fogColor = vec3(0.2); 
        if (u_fog) {
            baseFogDensity = max(baseFogDensity, 0.02);
        }
    }

    if (u_sunFocusEnabled) {
        float ang = u_timeOfDay;
        float sunHeight = cos(ang); 
        float darkness = smoothstep(0.2, -0.2, sunHeight);
        fogColor = mix(fogColor, vec3(0.01), darkness);
    }
    
    float currentDist = 0.0;
    
    for (int bounce = 0; bounce < 12; bounce++) {
        if (bounce >= u_maxBounces) break;
        Hit hit = traceScene(ro, rd);

        if (u_rain) {
            float rainVal = getRainFactor(ro, rd, hit.dist);
            col += vec3(0.7, 0.8, 0.9) * rainVal * throughput;
            throughput *= (1.0 - rainVal * 0.3);
        }

        if (hit.matIndex == -2) {
            vec3 sky = getSky(rd);
            if (u_fog && u_rain) { 
                 float d = max(u_maxDist - u_fogDistance, 0.0); 
                 float fogFactor = 1.0 - exp(-d * baseFogDensity * 0.5);
                 sky = mix(sky, fogColor, fogFactor);
            }
            col += sky * throughput;
            break;
        }
        if (hit.matIndex == -100) {
             col += vec3(1.0, 0.0, 0.0) * 20.0 * throughput;
             break;
        }
        if (hit.matIndex <= -10) {
            vec3 lc = u_lightColors[-hit.matIndex - 10];
            float maxC = max(lc.r, max(lc.g, lc.b));
            if (maxC > 0.0) lc /= maxC; 
            col += lc * 1.5 * throughput;
            break;
        }

        vec3 matColor;
        float reflectivity = 0.0;
        float currentRoughness = u_roughness;

        if (hit.matIndex == -1) {
            matColor = getFloorTexture(hit.point);
            if (u_rain) {
                reflectivity = 0.3; 
                matColor *= 0.4;
            } else {
                reflectivity = (u_groundTexture==2) ? 0.3 : (u_groundTexture==5 ? 0.6 : 0.0);
            }
        } else {
            SphereData s = getSphere(hit.matIndex);
            float refMod, roughMod;
            matColor = getBallTexture(hit.point - s.center, s.color, refMod, roughMod); 
            reflectivity = s.reflectivity * u_reflectionIntensity * refMod;
            currentRoughness = u_roughness * roughMod;
        }
        
        reflectivity = clamp(reflectivity, 0.0, 1.0);

        vec3 diffusePart, specularPart;
        getLighting(hit.point, hit.normal, -rd, reflectivity, currentRoughness, uv.x + float(bounce)*12.32, diffusePart, specularPart);
        
        if (u_fog) {
             float segStart = currentDist;
             float segEnd = currentDist + hit.dist;
             
             // Calculate how much of this ray segment is within the "fog zone".
             // Fog starts at u_fogDistance from the camera.
             float effectiveDist = max(0.0, segEnd - max(segStart, u_fogDistance));
             
             float d = effectiveDist;
             float fogF = 1.0 - exp(-d * baseFogDensity);
             diffusePart = mix(diffusePart, fogColor, fogF);
             specularPart = mix(specularPart, vec3(0.0), fogF); 
        }

        vec3 combinedLight = diffusePart * matColor * (1.0 - reflectivity) + specularPart * (u_ballTexture == 1 ? matColor : vec3(1.0)) * reflectivity;
        
        currentDist += hit.dist;

        if (u_globalIllumination && reflectivity < 0.1 && bounce < u_maxBounces - 1) {
             col += combinedLight * throughput;
             reflectivity = 0.5; 
             throughput *= matColor * 0.5; 
             ro = hit.point + hit.normal * EPSILON * 5.0;
             rd = cosWeightedRandomHemisphereDirection(hit.normal, uv.x + uv.y * 10.0 + u_time + float(bounce)*113.0);
        } else {
             col += combinedLight * throughput;
             throughput *= reflectivity; 
             if (length(throughput) < 0.01) break;
             ro = hit.point + hit.normal * EPSILON * 5.0;
             rd = reflect(rd, hit.normal);
        }
    }
    
    return col;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
    vec3 ro = u_cameraPos;
    vec3 fw = normalize(u_cameraDir);
    vec3 rt = normalize(u_cameraRight);
    vec3 up = normalize(u_cameraUp);
    
    vec3 col = vec3(0.0);
    for (int i = 0; i < u_rayCount; i++) {
        vec2 off = u_antialiasing ? (vec2(rand(uv+float(i)), rand(uv+float(i)+0.1))*0.001) : vec2(0.0);
        vec3 rd = normalize(fw + (uv.x+off.x)*rt + (uv.y+off.y)*up);
        col += castRay(ro, rd, uv + float(i));
    }
    col /= float(u_rayCount);
    col = ACESFilm(col); 
    col = pow(col, vec3(0.4545)); 
    outColor = vec4(col, 1.0);
}
`;