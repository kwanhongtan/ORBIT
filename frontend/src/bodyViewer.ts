import { BufferAttribute, BufferGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Scene, Vector3, WebGLRenderer } from "three";

export type CrewGender = "male" | "female" | "unspecified";

export async function createBodyViewer(canvas: HTMLCanvasElement, signal: AbortSignal, gender: CrewGender) {
  const model = gender === "female" ? "female" : "male";
  const response = await fetch(`/models/crew-wireframe-${model}.bin`, { signal });
  if (!response.ok) throw new Error("Body mesh unavailable");
  const buffer = await response.arrayBuffer();
  signal.throwIfAborted();
  const [positionCount, triangleCount, lineCount] = new Uint32Array(buffer, 0, 3);
  const positions = new BufferAttribute(new Float32Array(buffer, 12, positionCount), 3);
  const triangleOffset = 12 + positionCount * 4;
  const surface = new BufferGeometry().setAttribute("position", positions);
  surface.setIndex(new BufferAttribute(new Uint16Array(buffer, triangleOffset, triangleCount), 1));
  const edges = new BufferGeometry().setAttribute("position", positions);
  edges.setIndex(new BufferAttribute(new Uint16Array(buffer, triangleOffset + triangleCount * 2, lineCount), 1));
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const depthMaterial = new MeshBasicMaterial({ colorWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const lineMaterial = new LineBasicMaterial({ color: 0x43d7ed, transparent: true, opacity: 0.65 });
  const mesh = new Mesh(surface, depthMaterial);
  const body = new Group().add(mesh, new LineSegments(edges, lineMaterial));
  const scene = new Scene().add(body);
  const camera = new OrthographicCamera(-0.7, 0.7, 1.08, -1.08, 0.01, 10);
  camera.position.z = 4;
  camera.updateMatrixWorld();
  const ray = new Raycaster();
  const forward = new Vector3(0, 0, -1);
  const anchors = [
    [0, 0.92], [0.10, 0.52], [0.27, 0.55],
    [-0.53, 0.22], [0, 0.14], [0.13, -0.31]
  ].map(([x, y]) => {
    ray.set(new Vector3(x, y, 3), forward);
    return ray.intersectObject(mesh)[0]?.point ?? new Vector3(x, y, 0.03);
  });
  return {
    draw(angle: number, markers: NodeListOf<HTMLButtonElement>) {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const halfWidth = Math.max(0.64, 1.08 * width / height);
      const halfHeight = halfWidth * height / width;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      body.rotation.y = angle;
      renderer.render(scene, camera);
      markers.forEach((marker, index) => {
        const world = anchors[index].clone().applyMatrix4(body.matrixWorld);
        ray.set(new Vector3(world.x, world.y, 4), forward);
        const hit = ray.intersectObject(mesh)[0];
        marker.hidden = !!hit && hit.point.z - world.z > 0.025;
        const screen = world.project(camera);
        marker.style.left = `${(screen.x + 1) * 50}%`;
        marker.style.top = `${(1 - screen.y) * 50}%`;
      });
    },
    dispose() {
      surface.dispose();
      edges.dispose();
      depthMaterial.dispose();
      lineMaterial.dispose();
      renderer.dispose();
    }
  };
}
