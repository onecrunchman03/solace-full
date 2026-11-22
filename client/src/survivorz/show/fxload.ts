// SOLACE SURVIVORZ — THE SHOW: the effects' loader through the admin-only asset door.
//
// FxSystem asks for its sheets, atlases, manifests and gore models by a path under fx/
// (EFFECTS.md); the bench reads them off the dev server's static tree, the show reads them
// through /api/survivorz/fx/... with the session header like every other bought asset.
import type * as THREE from "three";
import { fxUrl, loadCompressed, loadGlb, loadTexture, sessionHeaders } from "../assets";
import { cachedBytes } from "../assetcache";
import type { FxLoader } from "../fx";

export function showFxLoader(renderer: THREE.WebGLRenderer): FxLoader {
  return {
    texture: (path, space) => loadTexture(fxUrl(path), { space }),
    compressed: (path) => loadCompressed(fxUrl(path), renderer),
    // (through the asset store: kept between watches, a stalled download dropped — assetcache.ts)
    json: async <T,>(path: string): Promise<T> => JSON.parse(new TextDecoder().decode(await cachedBytes(fxUrl(path), { headers: sessionHeaders() }))) as T,
    model: (path) => loadGlb(fxUrl(path)).then((g) => g.scene),
  };
}

/** A JSON file through the asset door's own areas (props.json, guns.json, cal.json). */
export async function assetJson<T>(area: "propinfo" | "gun" | "pairs" | "body", file: string): Promise<T> {
  const res = await fetch(`/api/survivorz/asset/${area}/${encodeURIComponent(file)}`, { headers: sessionHeaders() });
  if (!res.ok) throw new Error(`asset ${area}/${file} ${res.status}`);
  return (await res.json()) as T;
}
