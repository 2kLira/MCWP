import { ImageResponse } from "next/og";

/**
 * Iconos de la app instalada: el de Android (192 y 512, que pide el manifiesto) y el de iPhone
 * (180, `apple-touch-icon`). Se dibujan aquí en lugar de versionar PNG para que salgan del mismo
 * trazo y de los mismos tokens que la interfaz.
 *
 * La ruta termina en `.png` a propósito: proxy.ts deja pasar esa extensión sin sesión, y el
 * teléfono pide el icono por su cuenta, a veces sin cookies.
 *
 * El dibujo es un polígono de sección con su punto: la sección es la unidad del sistema. Va dentro
 * del 60 % central para sobrevivir al recorte de los iconos adaptables de Android (`maskable`).
 */

const TAMANOS: Record<string, number> = { "180.png": 180, "192.png": 192, "512.png": 512 };

export function generateStaticParams() {
  return Object.keys(TAMANOS).map((archivo) => ({ archivo }));
}

export async function GET(_peticion: Request, { params }: RouteContext<"/iconos/[archivo]">) {
  const { archivo } = await params;
  const lado = TAMANOS[archivo];
  if (!lado) return new Response(null, { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#24211e",
        }}
      >
        <svg width={lado * 0.6} height={lado * 0.6} viewBox="0 0 100 100">
          <path
            d="M18 30 L46 12 L84 26 L88 62 L62 90 L22 78 Z"
            fill="rgba(255,130,0,0.16)"
            stroke="#ff8200"
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <circle cx="52" cy="50" r="11" fill="#ff8200" />
        </svg>
      </div>
    ),
    { width: lado, height: lado },
  );
}
