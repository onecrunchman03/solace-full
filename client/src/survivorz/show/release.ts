// SOLACE SURVIVORZ — THE SHOW: let go of the CPU copy of what's already on the GPU.
//
// three keeps every texture's pixels and every geometry's arrays in JS after uploading them, in
// case they're uploaded again. In the show nothing is (no texture is ever edited, no context is
// ever restored mid-show — a lost context reloads the view), and the facility's zones are big:
// two 2048² float lightmaps a zone (67 MB of JS heap) and the shells' compressed textures. So once
// a texture or a geometry has gone up, its JS copy is dropped.
//
// What still needs its arrays must NOT come through here: anything raycast (the effects' surfaces
// are their own flat stand-ins), anything a decal is projected onto, anything skinned (the effects
// read a body's vertices for wounds and cuts).
import * as THREE from "three";

/** drop a texture's pixels once three has uploaded it */
export function releaseTexture(t: THREE.Texture): void {
  if (t.userData.released) return;
  t.userData.released = true;
  const prev = t.onUpdate;
  t.onUpdate = (tex: THREE.Texture) => {
    prev?.(tex);
    const img = tex.image as { data?: unknown; close?: () => void } | undefined;
    if (img && "data" in img) img.data = null;                      // a DataTexture (the EXR lightmaps)
    if (typeof ImageBitmap !== "undefined" && tex.image instanceof ImageBitmap) tex.image.close();
    const c = tex as THREE.CompressedTexture;
    if (c.isCompressedTexture) for (const m of c.mipmaps ?? []) (m as { data: unknown }).data = null;
  };
}

/** drop a static mesh's vertex arrays once uploaded (its bounds measured first: culling needs them) */
export function releaseGeometry(g: THREE.BufferGeometry): void {
  if (g.userData.released) return;
  g.userData.released = true;
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (!g.boundingBox) g.computeBoundingBox();
  const drop = function (this: THREE.BufferAttribute) { (this as unknown as { array: unknown }).array = null; };
  for (const a of Object.values(g.attributes)) if ((a as THREE.BufferAttribute).isBufferAttribute) (a as THREE.BufferAttribute).onUpload(drop);
  if (g.index) g.index.onUpload(drop);
}
