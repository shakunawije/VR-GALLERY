// src/gallery.ts
import * as THREE from 'three';
import {
  Scene, Group, Color, Vector3, Mesh,
  MeshStandardMaterial, AmbientLight, HemisphereLight, DirectionalLight,
  FogExp2, TextureLoader, RepeatWrapping, SRGBColorSpace,
  BoxGeometry, PlaneGeometry, DoubleSide,
} from 'three';
import { Frame } from './frame';
import type { ArtworkMeta, Bounds, RectXZ } from './types';

type BuildOpts = { imagesBase: string; artworks: ArtworkMeta[] };

/** a straight wall segment we can hang to. */
type WallSeg =
  | { kind: 'X';  z: number; x0: number; x1: number; nZ:  1 | -1 } // long along X, normal along Z
  | { kind: 'Z';  x: number; z0: number; z1: number; nX:  1 | -1 }; // long along Z, normal along X

export function buildGallery(scene: Scene, opts: BuildOpts) {
  // -----------------------------
  // Dimensions (meters)
  // -----------------------------
  const H = 3.6;                     // wall/ceiling height
  const WALL_T = 0.22;               // wall thickness
  const DOOR_W = 3.0;                // standard doorway width
  const WALL_GAP = 0.2;             // ~2 cm gap for frames from wall plane
  const CAP_MARGIN = 0.80;           // margin from segment edges when hanging
  const SPACING = 3.6;               // desired center-to-center spacing of frames
  const FRAME_W = 1.8;
  const HALF_W  = FRAME_W * 0.5;

  // Room rectangles (centered roughly around origin)
  // Atrium (main), North (forward), East (right), West (left)
  const R_ATRIUM = { x0: -16, x1:  16, z0: -10, z1:  10 };
  const R_NORTH  = { x0: -14, x1:  14, z0:  10, z1:  24 };
  const R_EAST   = { x0:  16, x1:  30, z0:  -8, z1:   8 };
  const R_WEST   = { x0: -30, x1: -16, z0:  -8, z1:   8 };

  // Global extents (for floor & bounds)
  const MIN_X = Math.min(R_ATRIUM.x0, R_NORTH.x0, R_EAST.x0, R_WEST.x0);
  const MAX_X = Math.max(R_ATRIUM.x1, R_NORTH.x1, R_EAST.x1, R_WEST.x1);
  const MIN_Z = Math.min(R_ATRIUM.z0, R_NORTH.z0, R_EAST.z0, R_WEST.z0);
  const MAX_Z = Math.max(R_ATRIUM.z1, R_NORTH.z1, R_EAST.z1, R_WEST.z1);
  const SIZE_X = MAX_X - MIN_X;
  const SIZE_Z = MAX_Z - MIN_Z;

  // -----------------------------
  // Scene look & fog
  // -----------------------------
  scene.background = new Color(0xf1f2f5);
  scene.fog = new FogExp2(0xe9ebef, 0.008);

  // -----------------------------
  // Textures & PBR materials
  // -----------------------------
  const tex = new TextureLoader();

  const floorTex =
    tex.load('/textures/floor.jpg', undefined, undefined, () => tex.load('/textures/floor.png'));
  floorTex.wrapS = floorTex.wrapT = RepeatWrapping;
  floorTex.colorSpace = SRGBColorSpace;
  floorTex.repeat.set(Math.ceil(SIZE_X / 4), Math.ceil(SIZE_Z / 4));

  const wallTex =
    tex.load('/textures/wall.jpg', undefined, undefined, () => tex.load('/textures/wall.png'));
  wallTex.wrapS = wallTex.wrapT = RepeatWrapping;
  wallTex.colorSpace = SRGBColorSpace;
  wallTex.repeat.set(2, 1);

  const floorMat = new MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.08 });
  const wallMat  = new MeshStandardMaterial({ map: wallTex,  roughness: 0.9,  metalness: 0.0, side: DoubleSide });
  const ceilMat  = new MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0, side: DoubleSide });

  // -----------------------------
  // Single floor covering everything
  // -----------------------------
  const floor = new Mesh(new PlaneGeometry(SIZE_X, SIZE_Z), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((MIN_X + MAX_X)/2, 0, (MIN_Z + MAX_Z)/2);
  floor.receiveShadow = true;
  scene.add(floor);

  // -----------------------------
  // Helpers to add mesh walls and record colliders & hangable segments
  // -----------------------------
  const colliders: RectXZ[] = [];
  const segs: WallSeg[] = [];

  const addWallX = (z: number, x0: number, x1: number, normalToward: 1 | -1, leaveDoorAt?: number) => {
    const len = x1 - x0;
    if (leaveDoorAt !== undefined) {
      // split into two around doorway center
      const d0 = leaveDoorAt - DOOR_W/2;
      const d1 = leaveDoorAt + DOOR_W/2;
      if (d0 > x0 + 0.01) addWallX(z, x0, d0, normalToward);
      if (x1 > d1 + 0.01) addWallX(z, d1, x1, normalToward);
      return;
    }
    const cx = (x0 + x1) / 2;
    const box = new Mesh(new BoxGeometry(len, H, WALL_T), wallMat);
    box.position.set(cx, H/2, z + (WALL_T/2) * normalToward);
    box.castShadow = true; box.receiveShadow = true;
    scene.add(box);

    // collider box
    colliders.push({
      minX: cx - len/2,
      maxX: cx + len/2,
      minZ: z + (normalToward>0 ? 0 : -WALL_T),
      maxZ: z + (normalToward>0 ? WALL_T : 0),
    });

    // hangable segment on inner face
    segs.push({ kind: 'X', z: z + normalToward* (WALL_T/2), x0, x1, nZ: normalToward });
  };

  const addWallZ = (x: number, z0: number, z1: number, normalToward: 1 | -1, leaveDoorAt?: number) => {
    const len = z1 - z0;
    if (leaveDoorAt !== undefined) {
      const d0 = leaveDoorAt - DOOR_W/2;
      const d1 = leaveDoorAt + DOOR_W/2;
      if (d0 > z0 + 0.01) addWallZ(x, z0, d0, normalToward);
      if (z1 > d1 + 0.01) addWallZ(x, d1, z1, normalToward);
      return;
    }
    const cz = (z0 + z1) / 2;
    const box = new Mesh(new BoxGeometry(WALL_T, H, len), wallMat);
    box.position.set(x + (WALL_T/2) * normalToward, H/2, cz);
    box.castShadow = true; box.receiveShadow = true;
    scene.add(box);

    colliders.push({
      minX: x + (normalToward>0 ? 0 : -WALL_T),
      maxX: x + (normalToward>0 ? WALL_T : 0),
      minZ: cz - len/2,
      maxZ: cz + len/2,
    });

    segs.push({ kind: 'Z', x: x + normalToward* (WALL_T/2), z0, z1, nX: normalToward });
  };

  const addCeilingForRect = (r: {x0:number;x1:number;z0:number;z1:number}) => {
    const c = new Mesh(new PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0), ceilMat);
    c.rotation.x = Math.PI/2;
    c.position.set((r.x0+r.x1)/2, H, (r.z0+r.z1)/2);
    scene.add(c);
  };

  // -----------------------------
  // Build rooms with doorways and dividers
  // -----------------------------
  // Atrium outer
  addWallX(R_ATRIUM.z0, R_ATRIUM.x0, R_ATRIUM.x1, +1, 0);                   // south, doorway center 0
  addWallX(R_ATRIUM.z1, R_ATRIUM.x0, R_ATRIUM.x1, -1, 0);                   // north, doorway to North gallery
  addWallZ(R_ATRIUM.x0, R_ATRIUM.z0, R_ATRIUM.z1, +1, 0);                   // west, doorway to West
  addWallZ(R_ATRIUM.x1, R_ATRIUM.z0, R_ATRIUM.z1, -1, 0);                   // east, doorway to East

  // Atrium internal dividers (islands / corridor cuts)
  addWallX((R_ATRIUM.z0+R_ATRIUM.z1)/2 - 2.0, R_ATRIUM.x0+2, R_ATRIUM.x1-2, +1); // mid-span
  addWallZ((R_ATRIUM.x0+R_ATRIUM.x1)/2 - 4.0, R_ATRIUM.z0+2, R_ATRIUM.z1-2, +1); // cross

  addCeilingForRect(R_ATRIUM);

  // North gallery (front)
  addWallX(R_NORTH.z0, R_NORTH.x0, R_NORTH.x1, +1, 0);          // connects back to atrium
  addWallX(R_NORTH.z1, R_NORTH.x0, R_NORTH.x1, -1);             // far end
  addWallZ(R_NORTH.x0, R_NORTH.z0, R_NORTH.z1, +1);             // west
  addWallZ(R_NORTH.x1, R_NORTH.z0, R_NORTH.z1, -1);             // east
  // two small zig-zag dividers inside North
  addWallX(R_NORTH.z0 + 4.0, R_NORTH.x0 + 2.0, R_NORTH.x1 - 6.0, +1);
  addWallZ(R_NORTH.x1 - 6.0, R_NORTH.z0 + 4.0, R_NORTH.z1 - 2.0, -1);

  addCeilingForRect(R_NORTH);

  // East gallery (right)
  addWallZ(R_EAST.x0, R_EAST.z0, R_EAST.z1, +1, 0);             // connects back to atrium
  addWallZ(R_EAST.x1, R_EAST.z0, R_EAST.z1, -1);                // far end
  addWallX(R_EAST.z0, R_EAST.x0, R_EAST.x1, +1);
  addWallX(R_EAST.z1, R_EAST.x0, R_EAST.x1, -1);
  // short divider
  addWallX((R_EAST.z0+R_EAST.z1)/2, R_EAST.x0 + 2.0, R_EAST.x1 - 2.0, +1);

  addCeilingForRect(R_EAST);

  // West gallery (left)
  addWallZ(R_WEST.x1, R_WEST.z0, R_WEST.z1, -1, 0);             // connects back to atrium
  addWallZ(R_WEST.x0, R_WEST.z0, R_WEST.z1, +1);                // far end
  addWallX(R_WEST.z0, R_WEST.x0, R_WEST.x1, +1);
  addWallX(R_WEST.z1, R_WEST.x0, R_WEST.x1, -1);
  // two little islands
  addWallZ((R_WEST.x0+R_WEST.x1)/2, R_WEST.z0+2.0, R_WEST.z1-2.0, +1);
  addWallX((R_WEST.z0+R_WEST.z1)/2 - 2.0, R_WEST.x0+2.0, R_WEST.x1-2.0, +1);

  addCeilingForRect(R_WEST);

  // -----------------------------
  // Lighting (brighter for PBR)
  // -----------------------------
  const amb  = new AmbientLight(0xffffff, 0.65);
  const hemi = new HemisphereLight(0xffffff, 0xd1d5db, 0.85);
  const sun  = new DirectionalLight(0xffffff, 0.75);
  sun.position.set(6, H, 2);
  sun.castShadow = true;
  scene.add(amb, hemi, sun, sun.target);

  // -----------------------------
  // Painting placement (fills every wall segment)
  // -----------------------------
  const frames: ArtworkMeta[] = [...opts.artworks]; // copy
  let idx = 0;

  const hangOnSegX = (seg: Extract<WallSeg, {kind:'X'}>) => {
    const usable = (seg.x1 - seg.x0) - 2 * (CAP_MARGIN + HALF_W);
    if (usable <= 0) return;

    const count = Math.floor(usable / SPACING) + 1;
    const startX = seg.x0 + CAP_MARGIN + HALF_W;
    const endX   = seg.x1 - CAP_MARGIN - HALF_W;

    for (let i = 0; i < count && idx < frames.length; i++) {
      const t = (count === 1) ? 0.5 : i / (count - 1);
      const x = startX + t * (endX - startX);
      const z = seg.z + (seg.nZ > 0 ?  WALL_GAP : -WALL_GAP);

      // ---- Corner collision check ----
      // if a perpendicular wall exists at x ± HALF_W within 0.05m, skip this painting
      const hitWall = segs.some((other) => {
        if (other.kind === 'Z') {
          // walls perpendicular to this one
          const nearX = Math.abs(other.x - x) < HALF_W + 0.05;
          const insideZ = z >= other.z0 - 0.05 && z <= other.z1 + 0.05;
          return nearX && insideZ;
        }
        return false;
      });
      if (hitWall) continue;
      // --------------------------------

      const meta = frames[idx++];
      const f = new Frame(meta, `${opts.imagesBase}/${meta.file}`, FRAME_W);
      f.position.set(x, 1.6, z);
      f.rotation.y = (seg.nZ > 0) ? 0 : Math.PI;
      scene.add(f);
    }
  };


  const hangOnSegZ = (seg: Extract<WallSeg, {kind:'Z'}>) => {
    const usable = (seg.z1 - seg.z0) - 2 * (CAP_MARGIN + HALF_W);
    if (usable <= 0) return;

    const count = Math.floor(usable / SPACING) + 1;
    const startZ = seg.z0 + CAP_MARGIN + HALF_W;
    const endZ   = seg.z1 - CAP_MARGIN - HALF_W;

    for (let i = 0; i < count && idx < frames.length; i++) {
      const t = (count === 1) ? 0.5 : i / (count - 1);
      const z = startZ + t * (endZ - startZ);
      const x = seg.x + (seg.nX > 0 ?  WALL_GAP : -WALL_GAP);

      // ---- Corner collision check ----
      const hitWall = segs.some((other) => {
        if (other.kind === 'X') {
          const nearZ = Math.abs(other.z - z) < HALF_W + 0.05;
          const insideX = x >= other.x0 - 0.05 && x <= other.x1 + 0.05;
          return nearZ && insideX;
        }
        return false;
      });
      if (hitWall) continue;
      // --------------------------------

      const meta = frames[idx++];
      const f = new Frame(meta, `${opts.imagesBase}/${meta.file}`, FRAME_W);
      f.position.set(x, 1.6, z);
      f.rotation.y = (seg.nX > 0) ? Math.PI/2 : -Math.PI/2;
      scene.add(f);
    }
  };

  // Order: fill atrium outer, then its dividers, then north/east/west and their dividers.
  // This naturally spreads artworks over many walls.
  const rectPriority = (seg: WallSeg): number => {
    const cx = (MIN_X + MAX_X)/2, cz = (MIN_Z + MAX_Z)/2;
    // heuristic: closer to origin (atrium) first
    const sx = seg.kind === 'X' ? (seg as any as {z:number}).z : (seg as any as {x:number}).x;
    const sz = seg.kind === 'X' ? (seg as any as {z:number}).z : (seg as any as {x:number}).x;
    // not perfect, but we already arranged building order; keep as is
    return Math.abs(sx - cx) + Math.abs(sz - cz);
  };

  // Already appended in “room construction” order; just iterate
  for (const seg of segs) {
    if (idx >= frames.length) break;
    if (seg.kind === 'X') hangOnSegX(seg); else hangOnSegZ(seg);
  }

  // -----------------------------
  // Bounds (keep player inside)
  // -----------------------------
  const bounds: Bounds = {
    minX: MIN_X + 0.6,
    maxX: MAX_X - 0.6,
    minY: 0.9,
    maxY: H - 0.4,
    minZ: MIN_Z + 0.6,
    maxZ: MAX_Z - 0.6,
  };

  const suggestedSpawn = new Vector3((R_ATRIUM.x0+R_ATRIUM.x1)/2 - 6, 1.6, (R_ATRIUM.z0+R_ATRIUM.z1)/2);

  return { root: new Group(), suggestedSpawn, bounds, colliders };
}