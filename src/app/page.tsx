import { redirect } from "next/navigation";
import { inicioDelUsuario } from "@/lib/permisos";

// Cada persona arranca en el Seguimiento de su módulo (DIAGNOSTICO D2).
export default async function Home() {
  redirect(await inicioDelUsuario());
}
