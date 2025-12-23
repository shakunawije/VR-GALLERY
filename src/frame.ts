import {
  Group, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PlaneGeometry, BoxGeometry, TextureLoader, SRGBColorSpace, Texture, CanvasTexture
} from 'three';
import type { ArtworkMeta } from './types';

const loader = new TextureLoader();

function fallbackTexture(label: string): Texture {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3b2f19'; // darker vintage tone
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#d4af37'; // gold text
  g.font = 'bold 40px serif';
  g.textAlign = 'center';
  g.fillText('IMAGE MISSING', 256, 260);
  return new CanvasTexture(c);
}

function captionTexture(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 200;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);

  // royal style background
  const gradient = g.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, '#2c1a0c');
  gradient.addColorStop(1, '#1a0f07');
  g.fillStyle = gradient;
  g.fillRect(0, 0, c.width, c.height);

  // gold frame border
  g.strokeStyle = '#d4af37';
  g.lineWidth = 10;
  g.strokeRect(5, 5, c.width - 10, c.height - 10);

  // text styling
  g.fillStyle = '#f5d77c';
  g.font = '700 60px "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2);

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class Frame extends Group {
  public imageMesh: Mesh;
  public captionMesh: Mesh;

  constructor(meta: ArtworkMeta, imageUrl: string, width = 1.8) {
    super();

    const frameDepth = 0.07;
    const imgH = width * 0.66;

    // Ancient gold frame with depth
    const bezelMaterial = new MeshStandardMaterial({
      color: 0xd4af37, // gold
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x2a1b00,
      emissiveIntensity: 0.4
    });
    const bezel = new Mesh(
      new BoxGeometry(width + 0.18, imgH + 0.18, frameDepth),
      bezelMaterial
    );
    bezel.castShadow = true;
    bezel.receiveShadow = true;
    this.add(bezel);

    // Add carved-style inner border (dark aged bronze)
    const innerFrame = new Mesh(
      new BoxGeometry(width + 0.12, imgH + 0.12, frameDepth - 0.02),
      new MeshStandardMaterial({
        color: 0x3a2a1a,
        roughness: 0.8,
        metalness: 0.3
      })
    );
    innerFrame.position.z = 0.005;
    this.add(innerFrame);

    // Image area
    const imgMat = new MeshBasicMaterial({ map: fallbackTexture(meta.file) });
    const picture = new Mesh(new PlaneGeometry(width, imgH), imgMat);
    picture.position.z = frameDepth * 0.5 + 0.0025;
    this.add(picture);
    this.imageMesh = picture;

    // Caption — golden engraved style
    const label = [meta.title, meta.author].filter(Boolean).join(' – ') || meta.file;
    const capTex = captionTexture(label);
    const capMat = new MeshBasicMaterial({ map: capTex, transparent: true });
    const capH = 0.22;
    const caption = new Mesh(new PlaneGeometry(width, capH), capMat);
    caption.position.set(0, -imgH / 2 - capH / 2 - 0.08, picture.position.z + 0.001);
    caption.renderOrder = 2;
    this.add(caption);
    this.captionMesh = caption;

    // async load image
    loader.setCrossOrigin('anonymous');
    loader.load(
      imageUrl,
      (t) => {
        t.colorSpace = SRGBColorSpace;
        imgMat.map = t;
        imgMat.needsUpdate = true;
      },
      undefined,
      (e) => console.warn('Failed to load', imageUrl, e)
    );
  }
}
