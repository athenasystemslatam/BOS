/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "@react-pdf/renderer"],
    // Todas las páginas del dashboard dependen de la sesión (fuerzan
    // renderizado dinámico). Por defecto Next.js igual guarda en el
    // navegador una copia de esas páginas por 30s al navegar por el menú
    // (Router Cache), y no siempre se invalida al llamar revalidatePath
    // desde una Server Action — por eso un cambio recién guardado a veces
    // no se veía hasta hacer F5. Con esto, cada navegación por el menú
    // vuelve a pedir los datos frescos al servidor.
    staleTimes: { dynamic: 0 },
  },
};

export default nextConfig;
