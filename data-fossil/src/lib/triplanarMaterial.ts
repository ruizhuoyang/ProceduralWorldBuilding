import * as THREE from 'three'

const CACHE_KEY = 'data-fossil-triplanar-v2'

/**
 * Patch MeshStandardMaterial to sample map / roughnessMap / normalMap
 * with object-space triplanar projection — no spherical UV seam.
 */
export function enableTriplanarMapping(
  material: THREE.MeshStandardMaterial,
  scale = 0.52,
): void {
  material.userData.triplanarScale = scale
  // Declares `uniform mat3 normalMatrix` in the fragment shader (needed below)
  material.normalMapType = THREE.ObjectSpaceNormalMap

  material.customProgramCacheKey = () => CACHE_KEY

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: material.userData.triplanarScale as number }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vTriPosition;
        varying vec3 vTriNormal;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vTriPosition = transformed;
        `,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        /* glsl */ `
        #include <defaultnormal_vertex>
        vTriNormal = normalize(objectNormal);
        `,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        varying vec3 vTriPosition;
        varying vec3 vTriNormal;
        uniform float uTriScale;

        vec3 triBlend(vec3 n) {
          vec3 b = pow(abs(n), vec3(4.0));
          return b / (b.x + b.y + b.z + 1e-5);
        }

        vec4 triplanarSample(sampler2D tex, vec3 p, vec3 n, float scale) {
          vec3 b = triBlend(n);
          vec4 x = texture2D(tex, p.zy * scale);
          vec4 y = texture2D(tex, p.xz * scale);
          vec4 z = texture2D(tex, p.xy * scale);
          return x * b.x + y * b.y + z * b.z;
        }

        // Reoriented tangent normals → object space (whiteout blend)
        vec3 triplanarNormal(sampler2D tex, vec3 p, vec3 n, float scale) {
          vec3 b = triBlend(n);
          vec3 tx = texture2D(tex, p.zy * scale).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(tex, p.xz * scale).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(tex, p.xy * scale).xyz * 2.0 - 1.0;

          vec3 nx = vec3(tx.z * sign(n.x), tx.y, tx.x);
          vec3 ny = vec3(ty.x, ty.z * sign(n.y), ty.y);
          vec3 nz = vec3(tz.x, tz.y, tz.z * sign(n.z));

          return normalize(nx * b.x + ny * b.y + nz * b.z + n);
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = triplanarSample(map, vTriPosition, vTriNormal, uTriScale);
          diffuseColor *= sampledDiffuseColor;
        #endif
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = triplanarSample(roughnessMap, vTriPosition, vTriNormal, uTriScale);
          roughnessFactor = roughness * texelRoughness.g;
        #endif
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #ifdef USE_NORMALMAP_OBJECTSPACE
          vec3 triN = triplanarNormal(normalMap, vTriPosition, vTriNormal, uTriScale);
          triN.xy *= normalScale;
          triN = normalize(triN);
          #ifdef FLIP_SIDED
            triN = - triN;
          #endif
          #ifdef DOUBLE_SIDED
            triN = triN * faceDirection;
          #endif
          normal = normalize( normalMatrix * triN );
        #endif
        `,
      )

    material.userData.triplanarShader = shader
  }

  material.needsUpdate = true
}

export function setTriplanarScale(material: THREE.MeshStandardMaterial, scale: number) {
  material.userData.triplanarScale = scale
  const shader = material.userData.triplanarShader as
    | { uniforms: { uTriScale: { value: number } } }
    | undefined
  if (shader?.uniforms?.uTriScale) {
    shader.uniforms.uTriScale.value = scale
  }
}
