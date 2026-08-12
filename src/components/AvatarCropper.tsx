import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OUTPUT = 512;
const BOX = 288;

/** Editor de foto de perfil: arraste para posicionar e use o zoom para cortar. */
export function AvatarCropper({
  file,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  file: File | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
  busy?: boolean;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!file) {
      setImg(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, BOX, BOX);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, BOX, BOX);
    const base = Math.max(BOX / img.width, BOX / img.height);
    const scale = base * zoom;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, BOX / 2 - w / 2 + offset.x, BOX / 2 - h / 2 + offset.y, w, h);
  }, [img, zoom, offset]);

  useEffect(() => {
    draw();
  }, [draw]);

  function clampOffset(next: { x: number; y: number }) {
    if (!img) return next;
    const base = Math.max(BOX / img.width, BOX / img.height);
    const scale = base * zoom;
    const maxX = Math.max(0, (img.width * scale - BOX) / 2);
    const maxY = Math.max(0, (img.height * scale - BOX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setOffset(clampOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  async function confirm() {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = OUTPUT;
    out.height = OUTPUT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    const ratio = OUTPUT / BOX;
    const base = Math.max(BOX / img.width, BOX / img.height);
    const scale = base * zoom * ratio;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.drawImage(
      img,
      OUTPUT / 2 - w / 2 + offset.x * ratio,
      OUTPUT / 2 - h / 2 + offset.y * ratio,
      w,
      h,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      out.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    if (blob) await onConfirm(blob);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar foto de perfil</DialogTitle>
          <DialogDescription>
            Arraste a imagem para posicionar e use o controle de zoom para cortar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none overflow-hidden rounded-full border border-border"
            style={{ width: BOX, height: BOX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} width={BOX} height={BOX} className="cursor-grab" />
          </div>
          <div className="w-full max-w-xs">
            <Slider
              value={[zoom]}
              min={1}
              max={4}
              step={0.01}
              onValueChange={(v) => {
                setZoom(v[0] ?? 1);
                setOffset((o) => clampOffset(o));
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={busy || !img}>
            Salvar foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
