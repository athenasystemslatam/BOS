import { redirect } from "next/navigation";

// El Seguimiento (cola de trabajo) llega en la etapa 2; hasta entonces la
// entrada del módulo es la lista de clientes.
export default function LibrosPage() {
  redirect("/libros/clientes");
}
